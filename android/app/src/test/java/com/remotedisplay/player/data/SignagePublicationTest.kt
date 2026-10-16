package com.remotedisplay.player.data

import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class SignagePublicationTest {
    @Test fun `incomplete publication and active visitor preserve old complete bytes across cache replacement and restart`() {
        val root=Files.createTempDirectory("fil-publication").toFile()
        val cacheDir=File(root,"cache").apply{mkdirs()}
        val cache=ContentCache(cacheDir,OkHttpClient())
        val downloads=DownloadCoordinator(cache,{"http://127.0.0.1:1"},{false},{_,_->})
        var visitor=false;var applied=0
        fun asset(id:String,rev:Long,text:String){File(cacheDir,"$id.png").writeText(text);File(cacheDir,"$id.png.rev").writeText(rev.toString())}
        fun payload(vararg ids:Pair<String,Long>)=JSONObject().put("assignments",JSONArray().apply{ids.forEach{(id,rev)->put(JSONObject().put("content_id",id).put("filename","$id.png").put("content_rev",rev))}})
        val dir=File(root,"publications")
        fun gate()=SignagePublication(dir,cache,downloads,{visitor},{applied++},{},{it()},false)
        val p=gate()
        try{
            asset("a",1,"original")
            assertFalse(p.offer(payload("a" to 1L)));p.stageOnce();assertEquals(1,applied)
            assertEquals("original",p.activeFile("a",1)?.readText())
            // Same ID gets new bytes; the active publication still owns its previous revision.
            asset("a",2,"replacement")
            assertFalse(p.offer(payload("a" to 2L,"b" to 1L)));p.stageOnce()
            assertEquals(1,applied);assertEquals("original",p.activeFile("a",1)?.readText())
            asset("b",1,"second");visitor=true;p.stageOnce();assertEquals(1,applied)
            visitor=false;p.stageOnce();assertEquals(2,applied)
            assertEquals("replacement",p.activeFile("a",2)?.readText());assertEquals("second",p.activeFile("b",1)?.readText())
            val restored=gate();try{assertEquals("replacement",restored.activeFile("a",2)?.readText());assertNotNull(restored.restoredPayload())}finally{restored.close()}
        }finally{p.close();downloads.shutdown();root.deleteRecursively()}
    }
}

package com.remotedisplay.player.data

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Stage a complete local signage generation; keep active/previous bytes outside the mutable download cache. */
class SignagePublication(
    private val dir: File,
    private val cache: ContentCache,
    private val downloads: DownloadCoordinator,
    private val inSession: () -> Boolean,
    private val onReady: (JSONObject) -> Unit,
    private val onError: () -> Unit,
    private val postToMain: (((() -> Unit)) -> Unit)? = null,
    autoStart: Boolean = true,
) {
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadScheduledExecutor()
    private val metadata = File(dir,"active.json")
    @Volatile private var active: JSONObject? = null
    @Volatile private var signature: String? = null
    @Volatile private var previous: String? = null
    @Volatile private var pending: JSONObject? = null
    @Volatile private var pendingSig: String? = null
    @Volatile private var closed = false
    private var lastFailure = 0L
    init {
        dir.mkdirs()
        for(saved in listOf(metadata,File(dir,"previous.json"))) {
            try {val p=JSONObject(saved.readText());val folder=File(dir,p.getString("signature"))
                if(validFolder(folder)){active=p;signature=p.getString("signature");break}
            }catch(_:Exception){}
        }
        try{previous=JSONObject(File(dir,"previous.json").readText()).getString("signature")}catch(_:Exception){}
        if(autoStart) worker.scheduleWithFixedDelay({stageOnce()},0,3,TimeUnit.SECONDS)
    }
    fun restoredPayload(): JSONObject? = active?.optJSONObject("payload")
    fun activeFile(id: String, rev: Long): File? {
        val p=active ?: return null
        val assets=p.optJSONObject("assets") ?: return null
        val key="$id:$rev";val name=assets.optString(key)
        if(name.isEmpty())return null
        return File(File(dir,p.getString("signature")),name).takeIf{it.isFile&&it.length()>0}
    }
    /** Called on main before a normal payload can replace the running playlist or its cold-start copy. */
    fun offer(data: JSONObject): Boolean {
        val items=data.optJSONArray("assignments") ?: return true
        // Explicit clear, emergency widgets and synced modes preserve upstream priority/clock policy.
        if(items.length()==0 || !data.isNull("wall_config") || !data.isNull("group_sync") ||
            (0 until items.length()).any {items.optJSONObject(it)?.optBoolean("interrupt")==true}) {pending=null;pendingSig=null;return true}
        val sig=digest((items.toString()+(data.optJSONObject("layout")?.toString() ?: "")+data.optString("orientation")).toByteArray())
        if(sig==signature){pending=null;pendingSig=null;return true}
        pending=JSONObject(data.toString());pendingSig=sig
        return false
    }
    private fun onMain(block: () -> Unit) { if(postToMain!=null)postToMain.invoke(block) else main.post(block) }
    internal fun stageOnce() {
        if(closed||inSession())return
        val payload=pending ?: return;val sig=pendingSig ?: return
        val items=payload.optJSONArray("assignments") ?: return
        try {
            val folder=File(dir,sig)
            val existingValid=validFolder(folder)
            val local=(0 until items.length()).mapNotNull{items.optJSONObject(it)}.filter{
                it.optString("content_id").let { id -> id.isNotEmpty()&&id!="null" } &&
                (it.isNull("widget_id")||it.optString("widget_id").isEmpty()) &&
                (it.isNull("remote_url")||it.optString("remote_url").isEmpty())
            }
            var allReady=true
            for(item in if(existingValid) emptyList() else local){
                val id=item.getString("content_id");val rev=item.optLong("content_rev",0)
                if(!cache.isContentCached(id,rev)) {allReady=false;downloads.ensure(id,item.optString("filename","content"),rev)}
            }
            if(!allReady)return
            val total=local.sumOf { cache.getCachedFile(it.getString("content_id"))?.length() ?: 0L }
            dir.listFiles()?.filter{it.isDirectory&&it.name!=signature&&it.name!=previous&&it.name!=sig&&it.name!="staging"}?.forEach{it.deleteRecursively()}
            if(!existingValid && (total>512L*1024*1024 || dir.usableSpace<total+128L*1024*1024))throw IllegalStateException("Publication exceeds disk budget")
            val temp=File(dir,"staging")
            val assets=JSONObject()
            if(!existingValid) {
                if(folder.name!=signature&&folder.name!=previous)folder.deleteRecursively()
                if(folder.exists())error("Referenced publication is corrupt")
                temp.deleteRecursively();temp.mkdirs()
                for(item in local){
                    val id=item.getString("content_id");val rev=item.optLong("content_rev",0)
                    val source=cache.getCachedFile(id) ?: error("Asset disappeared")
                    val name=digest("$id:$rev".toByteArray())+"."+source.extension
                    val target=File(temp,name);source.copyTo(target,true)
                    check(cache.isContentCached(id,rev) && digestFile(source)==digestFile(target))
                    assets.put("$id:$rev",name)
                }
                File(temp,"assets.json").writeText(assets.toString())
                val sums=JSONObject();temp.listFiles()?.filter{it.isFile}?.forEach{sums.put(it.name,digestFile(it))}
                File(temp,"checksums.json").writeText(sums.toString())
                check(temp.renameTo(folder))
            } else {
                val stored=JSONObject(File(folder,"assets.json").readText());stored.keys().forEach{assets.put(it,stored.getString(it))}
            }
            if(pendingSig!=sig)return
            val next=JSONObject().put("signature",sig).put("payload",payload).put("assets",assets)
            onMain {
                if(closed||pendingSig!=sig||inSession())return@onMain
                if(metadata.exists())metadata.copyTo(File(dir,"previous.json"),true)
                next.put("payload",pending ?: payload)
                val tmp=File(dir,"active.tmp");tmp.writeText(next.toString());check(tmp.renameTo(metadata))
                previous=signature;active=next;signature=sig;pending=null;pendingSig=null
                onReady(next.getJSONObject("payload"))
                worker.execute {dir.listFiles()?.filter{it.isDirectory&&it.name!=sig&&it.name!=previous&&it.name!="staging"}?.forEach{it.deleteRecursively()}}
            }
        } catch(_:Exception){
            val now=System.currentTimeMillis()
            if(now-lastFailure>60000){lastFailure=now;onMain{if(!closed)onError()}}
        }
    }
    private fun validFolder(folder:File):Boolean = try {
        val checks=JSONObject(File(folder,"checksums.json").readText())
        checks.has("assets.json") && checks.keys().asSequence().all {name->
            val file=File(folder,name);file.isFile&&digestFile(file)==checks.getString(name)
        }
    }catch(_:Exception){false}
    fun close(){closed=true;worker.shutdownNow();main.removeCallbacksAndMessages(null)}
    companion object {
        private fun digest(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
        private fun digestFile(file:File):String {val md=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val b=ByteArray(32768);while(true){val n=input.read(b);if(n<0)break;md.update(b,0,n)}};return md.digest().joinToString(""){"%02x".format(it)}}
    }
}

package com.remotedisplay.player.kiosk

import android.app.Activity
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Managed menu is a bounded, checksum-verified offline document, separate from visitor state. */
class HybridKiosk(
    private val activity: Activity,
    private val root: ViewGroup,
    private val server: () -> String,
    private val device: () -> String,
    private val token: () -> String,
    private val onEnter: () -> Unit,
    private val onExit: () -> Unit,
    private val onApplied: (Int, String) -> Unit,
    private val onError: (String, String) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS).followRedirects(false).build()
    private val dir = File(activity.filesDir, "fil-kiosk").apply { mkdirs() }
    private val metadata = File(dir, "active.json")
    private var active: JSONObject? = null
    private var pending: JSONObject? = null
    private var downloading: String? = null
    private var retryAt = 0L
    private var failures = 0
    private var generation = 0L
    private var closed = false
    private var frame: FrameLayout? = null
    private var web: WebView? = null
    private var warning: TextView? = null
    private var clock: HybridClock? = null
    var managedSignageOnly = false
        private set
    private var swallow = false
    val sessionActive: Boolean get() = frame != null
    init {
        try {
            val p = JSONObject(metadata.readText())
            if (verified(file(p), p)) active = p
        } catch (_: Exception) { /* Fresh installation: signage remains visible. */ }
    }
    private fun file(p: JSONObject) = File(dir, p.getString("sha256") + ".html")
    private fun verified(f: File, p: JSONObject): Boolean {
        if (p.optString("schema") != "fil-kiosk-v1") return false
        val sha = p.optString("sha256")
        if (!Regex("[a-f0-9]{64}").matches(sha) || !f.isFile || f.length() > MAX_BYTES) return false
        val digest = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input -> val b=ByteArray(32768); while(true) {val n=input.read(b);if(n<0)break;digest.update(b,0,n)} }
        return digest.digest().joinToString("") { "%02x".format(it) } == sha
    }
    fun configure(raw: JSONObject?) {
        if (closed) return
        val p = raw?.let { JSONObject(it.toString()) } ?: JSONObject().put("mode", "signage_only")
        if (p.optString("mode") != "hybrid_kiosk") {
            generation++
            managedSignageOnly = true
            if (sessionActive) pending = p else adopt(p)
            return
        }
        if (p.optString("schema") != "fil-kiosk-v1") return
        managedSignageOnly = false
        val sha = p.optString("sha256")
        if (!Regex("[a-f0-9]{64}").matches(sha)) return
        if (active?.optString("sha256") == sha) { if(sessionActive) pending=p else adopt(p); return }
        if (pending?.optString("sha256") == sha || downloading == sha || SystemClock.elapsedRealtime()<retryAt) return
        val endpoint = p.optString("bundle_url")
        if (!endpoint.startsWith("/api/kiosk/") || !endpoint.contains("/render?fil_version=")) return
        if (p.optLong("bytes", MAX_BYTES+1) !in 1..MAX_BYTES) return
        val serial = ++generation
        downloading = sha
        worker.execute {
            val dest = file(p); val temp = File(dir,"download.tmp")
            try {
                if (!verified(dest,p)) {
                    if (dir.usableSpace < MAX_BYTES * 2) throw IllegalStateException("Low disk space")
                    val request=Request.Builder().url(server().trimEnd('/')+endpoint+"&device="+android.net.Uri.encode(device()))
                        .header("Authorization","Bearer "+token()).build()
                    http.newCall(request).execute().use { response ->
                        check(response.isSuccessful)
                        val body=response.body ?: error("Empty bundle")
                        body.byteStream().use { input -> temp.outputStream().use { out ->
                            val b=ByteArray(32768);var total=0L
                            while(true){val n=input.read(b);if(n<0)break;total+=n;check(total<=MAX_BYTES);out.write(b,0,n)}
                        } }
                    }
                    check(verified(temp,p))
                    check(temp.renameTo(dest))
                }
                handler.post {
                    downloading=null
                    if(!closed && generation==serial) { failures=0; retryAt=0
                        if(sessionActive) pending=p else adopt(p)
                    }
                }
            } catch (_: Exception) {
                temp.delete()
                handler.post { downloading=null;failures=(failures+1).coerceAtMost(6)
                    retryAt=SystemClock.elapsedRealtime()+(30000L*(1L shl failures)).coerceAtMost(15*60000L)
                    onError("fil_cache_download_failed","Menu update failed; last verified publication preserved") }
            }
        }
    }
    private fun adopt(p: JSONObject) {
        if(p.optString("mode") != "hybrid_kiosk") {active=null;metadata.delete();return}
        if (!file(p).isFile) return
        val temp=File(dir,"active.tmp");temp.writeText(p.toString());check(temp.renameTo(metadata))
        val previous=active?.optString("sha256");active=p
        onApplied(p.optInt("version"), p.optString("sha256"))
        // Keep current and previous complete publication; never prune a visitor's active bytes.
        dir.listFiles()?.filter {it.extension=="html" && it.name!=p.optString("sha256")+".html" && it.name!=previous+".html"}?.forEach {it.delete()}
    }
    fun dispatch(event: MotionEvent): Boolean {
        if(swallow) {if(event.actionMasked==MotionEvent.ACTION_UP||event.actionMasked==MotionEvent.ACTION_CANCEL)swallow=false;return true}
        if(sessionActive) {
            // A long scroll/drag is ongoing use too; idle starts after the last touch,
            // while the first signage gesture remains completely swallowed above.
            if(event.actionMasked==MotionEvent.ACTION_DOWN || event.actionMasked==MotionEvent.ACTION_MOVE || event.actionMasked==MotionEvent.ACTION_UP) {
                clock?.touch(SystemClock.elapsedRealtime());warning?.visibility=android.view.View.GONE
            }
            return false
        }
        if(event.actionMasked!=MotionEvent.ACTION_DOWN) return false
        val p=active ?: return false
        if(p.optString("mode")!="hybrid_kiosk")return false
        swallow=true
        open(p)
        return true
    }
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private fun open(p: JSONObject) {
        if(sessionActive)return
        onEnter()
        KioskSession.markManagedSession(activity)
        activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        clock=HybridClock(p.optInt("idle_sec",60).coerceIn(15,3600)*1000L,p.optInt("warning_sec",10).coerceIn(0,60)*1000L).also { it.touch(SystemClock.elapsedRealtime()) }
        val layer=FrameLayout(activity);frame=layer
        val browser=WebView(activity);web=browser
        browser.settings.apply {javaScriptEnabled=true;domStorageEnabled=false;allowFileAccess=false;allowContentAccess=false;setSupportMultipleWindows(false);mediaPlaybackRequiresUserGesture=true}
        browser.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                if(request.url.toString()=="https://fil-kiosk.invalid/return")finish()
                if (request.isForMainFrame) return true
                return !allowed(request.url)
            }
            private fun allowed(uri: android.net.Uri): Boolean {
                val hosts=p.optJSONArray("allowed_hosts") ?: return false
                return uri.scheme=="https" && (0 until hosts.length()).any { hosts.optString(it)==uri.host }
            }
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse? {
                // No native bridge. External content is isolated in a sandboxed frame and explicit host allowlist.
                if (!request.isForMainFrame && allowed(request.url)) return null
                return WebResourceResponse("text/plain","UTF-8",ByteArrayInputStream("Bağlantı gerekli".toByteArray()))
            }
        }
        browser.setDownloadListener {_,_,_,_,_->}
        layer.addView(browser,FrameLayout.LayoutParams(-1,-1))
        val warn=TextView(activity).apply {textSize=28f;setTextColor(Color.WHITE);setBackgroundColor(0xEE102230.toInt());gravity=Gravity.CENTER;visibility=android.view.View.GONE;setOnClickListener{clock?.touch(SystemClock.elapsedRealtime());visibility=android.view.View.GONE}}
        warning=warn;layer.addView(warn,FrameLayout.LayoutParams(-1,180,Gravity.BOTTOM))
        root.addView(layer,ViewGroup.LayoutParams(-1,-1))
        browser.loadDataWithBaseURL("https://fil-kiosk.invalid/menu",file(p).readText(),"text/html","UTF-8",null)
        handler.post(tick)
    }
    private val tick=object:Runnable {
        override fun run(){
            val p=active ?: return;val w=web ?: return
            val now=SystemClock.elapsedRealtime()
            w.evaluateJavascript("window.filVideoPlaying===true") { value ->
                if(!sessionActive || web !== w)return@evaluateJavascript
                clock?.video(value=="true",now)
            }
            when(val action=clock?.tick(now)) {
                is KioskIdle.Action.Reset -> {finish();return}
                is KioskIdle.Action.Warn -> {warning?.text="Yayına dönülüyor: ${action.secondsLeft} sn\nDevam etmek için dokunun";warning?.visibility=android.view.View.VISIBLE}
                else -> warning?.visibility=android.view.View.GONE
            }
            handler.postDelayed(this,500)
        }
    }
    fun finish() {
        if(!sessionActive)return
        handler.removeCallbacks(tick)
        val w=web;web=null;warning=null
        (frame?.parent as? ViewGroup)?.removeView(frame);frame=null
        w?.stopLoading();w?.loadUrl("about:blank");KioskSession.wipeAll(activity,w);w?.destroy()
        activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        clock?.end();clock=null
        pending?.let {pending=null;adopt(it)}
        onExit()
    }
    fun close(){finish();closed=true;generation++;handler.removeCallbacksAndMessages(null);worker.shutdownNow()}
    companion object {private const val MAX_BYTES=32L*1024*1024}
}

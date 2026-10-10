package com.example.officer_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.app.Activity
import android.content.Intent
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.text.TextUtils

class MainActivity : FlutterActivity() {
    private var pendingText: String? = null
    private var pendingResult: MethodChannel.Result? = null
    private var printView: WebView? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "traffic/receipts").setMethodCallHandler { call, result ->
            val text = call.argument<String>("text") ?: ""
            when (call.method) {
                "save" -> {
                    if (pendingResult != null) { result.error("BUSY", "Finish the current save first", null) }
                    else {
                        pendingText = text
                        pendingResult = result
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TITLE, call.argument<String>("filename") ?: "receipt.txt")
                        }
                        startActivityForResult(intent, 7042)
                    }
                }
                "print" -> {
                    printView?.destroy()
                    val view = WebView(this)
                    printView = view
                    view.webViewClient = object : WebViewClient() {
                        override fun onPageFinished(webView: WebView, url: String) {
                            val manager = getSystemService(PRINT_SERVICE) as PrintManager
                            manager.print("Traffic payment receipt", webView.createPrintDocumentAdapter("Traffic receipt"), null)
                            result.success(null)
                        }
                    }
                    view.loadDataWithBaseURL(null, "<html><body><pre style='white-space:pre-wrap;font:14px sans-serif'>${TextUtils.htmlEncode(text)}</pre></body></html>", "text/html", "UTF-8", null)
                }
                else -> result.notImplemented()
            }
        }
    }
    @Deprecated("Android activity result bridge")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7042) {
            try {
                if (resultCode == Activity.RESULT_OK && data?.data != null) {
                    val stream = contentResolver.openOutputStream(data.data!!) ?: error("Destination unavailable")
                    stream.use { it.write((pendingText ?: "").toByteArray(Charsets.UTF_8)) }
                }
                pendingResult?.success(null)
            } catch (_: Exception) { pendingResult?.error("SAVE_FAILED", "Could not save receipt", null) }
            finally { pendingResult = null; pendingText = null }
        }
    }
    override fun onDestroy() { printView?.destroy(); super.onDestroy() }
}

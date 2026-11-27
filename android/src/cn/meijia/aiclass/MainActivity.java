package cn.meijia.aiclass;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * 安卓外壳：把电脑上的网页当成 App 打开。
 *
 * 设计要点：
 *  1. 服务器地址不写死，存在 SharedPreferences 里，首次安装由 setup.html 填一次。
 *     这样电脑 IP 变了只要在平板上改一下地址，不用重新打包 APK。
 *  2. 全屏沉浸：没有地址栏、没有状态栏，打开就是满屏画纸。
 *  3. 网页里"导出图片"用的是 blob + a[download]，WebView 默认不处理，
 *     所以注入一段脚本把 blob 转成 base64 交给原生层存进相册。
 */
public class MainActivity extends Activity {

    private static final String PREFS = "aiclass";
    private static final String KEY_URL = "base_url";
    private static final String DEFAULT_URL = "http://192.168.0.106:5173";
    private static final String SETUP_PAGE = "file:///android_asset/setup.html";
    private static final String ERROR_PAGE = "file:///android_asset/error.html";
    private static final int REQ_FILE = 1001;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private long lastBackAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);

        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings st = web.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);          // 登录态可能存在 localStorage，必须开
        st.setDatabaseEnabled(true);
        st.setAllowFileAccess(true);
        st.setAllowContentAccess(true);
        st.setLoadWithOverviewMode(true);
        st.setUseWideViewPort(true);
        st.setSupportZoom(false);
        st.setBuiltInZoomControls(false);
        st.setTextZoom(100);                    // 不跟随系统字体大小，避免布局被撑坏
        st.setMediaPlaybackRequiresUserGesture(false);
        st.setCacheMode(WebSettings.LOAD_DEFAULT);
        st.setUserAgentString(st.getUserAgentString() + " AiArtClass/1.0");
        if (Build.VERSION.SDK_INT >= 21) {
            st.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.addJavascriptInterface(new Bridge(), "AiClass");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch (Exception e) {
                    toastOnUi("下载失败：" + e.getMessage());
                }
            }
        });

        setContentView(web);
        enterImmersive();

        askLegacyStoragePermissionIfNeeded();

        String saved = prefs().getString(KEY_URL, "");
        load(saved == null || saved.length() == 0 ? SETUP_PAGE : saved);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void load(final String url) {
        runOnUiThread(new Runnable() {
            @Override public void run() { web.loadUrl(url); }
        });
    }

    private void toastOnUi(final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ---------- 全屏 ----------

    private void enterImmersive() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    // ---------- 返回键 ----------

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000) {
            super.onBackPressed();
        } else {
            lastBackAt = now;
            toastOnUi("再按一次退出");
        }
    }

    // ---------- 文件选择（网页里上传图片用） ----------

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        result = new Uri[n];
                        for (int i = 0; i < n; i++) {
                            result[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void askLegacyStoragePermissionIfNeeded() {
        // checkSelfPermission / requestPermissions 都是 API 23 才有的。
        // Android 5.x 上调用会直接 NoSuchMethodError 崩溃，所以必须判版本。
        // Android 6~9 才需要运行时申请；10 以后用 MediaStore，不需要存储权限。
        if (Build.VERSION.SDK_INT < 23 || Build.VERSION.SDK_INT > 28) return;
        if (checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 2001);
        }
    }

    // ---------- JS 桥 ----------

    private class Bridge {
        @JavascriptInterface
        public String defaultUrl() {
            return DEFAULT_URL;
        }

        @JavascriptInterface
        public String currentUrl() {
            String v = prefs().getString(KEY_URL, "");
            return v == null ? "" : v;
        }

        @JavascriptInterface
        public void setBaseUrl(String url) {
            String u = url == null ? "" : url.trim();
            if (u.length() == 0) return;
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                u = "http://" + u;
            }
            while (u.endsWith("/")) {
                u = u.substring(0, u.length() - 1);
            }
            prefs().edit().putString(KEY_URL, u).apply();
            load(u);
        }

        @JavascriptInterface
        public void openSetup() {
            load(SETUP_PAGE);
        }

        @JavascriptInterface
        public void reloadCurrent() {
            String u = prefs().getString(KEY_URL, "");
            load(u == null || u.length() == 0 ? SETUP_PAGE : u);
        }

        @JavascriptInterface
        public void toast(String msg) {
            toastOnUi(msg == null ? "" : msg);
        }

        /** 网页导出的图片转成 base64 传进来，存到 相册/AI美术课堂 */
        @JavascriptInterface
        public void savePng(final String base64, final String fileName) {
            new Thread(new Runnable() {
                @Override public void run() {
                    String name = (fileName == null || fileName.length() == 0) ? "artwork.png" : fileName;
                    if (!name.toLowerCase().endsWith(".png")) name = name + ".png";
                    try {
                        byte[] data = Base64.decode(base64, Base64.DEFAULT);
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                        v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                        if (Build.VERSION.SDK_INT >= 29) {
                            v.put(MediaStore.Images.Media.RELATIVE_PATH,
                                    Environment.DIRECTORY_PICTURES + "/AI美术课堂");
                            v.put(MediaStore.Images.Media.IS_PENDING, 1);
                        }
                        Uri uri = getContentResolver()
                                .insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                        if (uri == null) {
                            toastOnUi("保存失败：无法写入相册");
                            return;
                        }
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        os.write(data);
                        os.flush();
                        os.close();
                        if (Build.VERSION.SDK_INT >= 29) {
                            ContentValues done = new ContentValues();
                            done.put(MediaStore.Images.Media.IS_PENDING, 0);
                            getContentResolver().update(uri, done, null, null);
                        }
                        toastOnUi("已保存到相册：AI美术课堂/" + name);
                    } catch (Exception e) {
                        toastOnUi("保存失败：" + e.getMessage());
                    }
                }
            }).start();
        }
    }

    // ---------- WebView 客户端 ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            // http/https 都留在 App 内；其它协议（tel、mailto 等）交给系统
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) { }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            injectBlobDownloadHook(view);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (Build.VERSION.SDK_INT >= 21 && request.isForMainFrame()) {
                view.loadUrl(ERROR_PAGE);
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (Build.VERSION.SDK_INT < 23) {
                view.loadUrl(ERROR_PAGE);
            }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
                return true;
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
        }

        @Override
        public void onPermissionRequest(final android.webkit.PermissionRequest request) {
            request.grant(request.getResources());
        }
    }

    /**
     * 网页"导出图片"走的是 URL.createObjectURL + a[download]，WebView 不认。
     * 这里在 document 上挂一个捕获阶段的监听，把 blob 抓下来转 base64 交给原生层。
     */
    private void injectBlobDownloadHook(WebView view) {
        String js = "(function(){"
                + "if(window.__aiClassBlobHook) return;"
                + "window.__aiClassBlobHook=true;"
                + "document.addEventListener('click',function(e){"
                + "  var el=e.target;"
                + "  var a=el&&el.closest?el.closest('a[download]'):null;"
                + "  if(!a) return;"
                + "  var href=a.getAttribute('href')||'';"
                + "  if(href.indexOf('blob:')!==0&&href.indexOf('data:')!==0) return;"
                + "  e.preventDefault();e.stopPropagation();"
                + "  var name=a.getAttribute('download')||'artwork.png';"
                + "  fetch(href).then(function(r){return r.blob();}).then(function(b){"
                + "    var fr=new FileReader();"
                + "    fr.onload=function(){"
                + "      var s=String(fr.result);var i=s.indexOf(',');"
                + "      if(i>0&&window.AiClass){window.AiClass.savePng(s.slice(i+1),name);}"
                + "    };"
                + "    fr.readAsDataURL(b);"
                + "  }).catch(function(){ if(window.AiClass) window.AiClass.toast('导出失败'); });"
                + "},true);"
                + "})();";
        if (Build.VERSION.SDK_INT >= 19) {
            view.evaluateJavascript(js, null);
        } else {
            view.loadUrl("javascript:" + js);
        }
    }
}

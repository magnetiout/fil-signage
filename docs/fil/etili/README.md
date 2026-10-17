# FILSign / Etili Seramik sunum demosu

Platform markası **FILSign**; Etili Seramik yalnızca ayrı sunum çalışma alanı ve `presentation: catalog` menü içeriğidir. Mevcut çalışma alanları, cihaz atamaları, paket kimliği, API/enum/DB kimlikleri ve imzalama anahtarı korunur. Canlı kurulum baştan çalıştırılmaz.

## Kaynak ve kapsam

Kaynak https://etiliseramik.com/; izin: firma sitesini yapan proje sahibinin bu teklif demosu için açık talimatı. Yalnızca herkese açık birinci taraf ürün metinleri, görseller ve kurumsal kimlik kullanılır. Bayi girişi, özel hesap, DRM ve üçüncü taraf 360 sağlayıcısı kapsam dışıdır. Ses/müzik eklenmez.

- WooCommerce Store API: `/?rest_route=/wc/store/v1/products&per_page=100&page=N`. Sekiz sayfa, 761 kaynak kaydı; ürün sitemap'indeki 761 adresle birebir eşleşir. Pretty `/wp-json/` adresi bu sitede HTML döndürdüğü için API kabul edilmez.
- 168 düz kaynak seri kategorisi; yapay üretici kategori ağacı oluşturulmaz. Teknik `Özellik` alanı 660 Porselen, 101 Duvar Karosu kaydı verir.
- Kaynak kayıtların tamamı WooCommerce `simple`; parent/variation boş. Sunumda seri kimliği + doğrulanmış ebattan önceki ad bölümüyle 501 gezinme grubu oluşturulur. Bunlar **üreticinin ayrı ürün/seri/SKU sayısı değildir**. 761 kaynak kimliği ve seçenek hiçbir zaman birleştirilip kaybedilmez.
- 928 görsel adresi, 920 özgün dosya hash'i, 842 optimize dosya hash'i. Görsel türleri ayrı görsel incelemesiyle işaretlenir; belirsiz kapak türü açıkça belirtilir.
- Ürün sayfalarının tamamında teknik alanlar bulundu. Yayımlanmayan açıklama/SKU alanları boş kalır. Store API'deki sıfır fiyat ve varsayılan stok değeri ticari veri kabul edilmez. Teknik alanların anlamı, olumsuzluklar ve kaynak yazımı korunur.
- Ana sayfa, kurumsal/katalog sayfaları, gerçek tarayıcı ağı ve açık WP video uç noktası doğrudan veya yerleşik video vermiyor. Sitenin bağladığı resmî Etili Seramik kanalının yeni `lockupViewModel` listesinde ayrıca 3 video doğrulandı:14 ve 59 saniyelik “Bir Memleket Hikayesi”,171 saniyelik “Etili Seramik Fabrika Tanıtım Filmi (2024)”. Üçünün de herkese açık kaynak kopyası Minix’e indirildi; oturum, çerez, DRM veya erişim kısıtı aşma kullanılmadı. Bunlar kaynaktan edinilen YouTube dağıtım kopyalarıdır, stüdyo ham dosyası olarak tanımlanmaz. Üç kaynak için portre/yatay 6 H.264/AAC türev hazırlanır. Ayrıca fotoğraflardan 2 özgün 72 saniyelik tanıtım filmi üretilir.
- Kurumsal kılavuz: Pantone 124 / RGB235,169,0 (#EBA900); Pantone 419 / RGB33,35,34 (#212322). Resmî logo oranı korunur. Kılavuz Mulish, web sitesi Montserrat kullanıyor; demo ek font indirmeden sistem sans-serif ailesini kullanır. Fotoğraf, renk/desen veya mekân üretimi yapılmaz.

Kaynak kayıtları, görsel hash’leri, eksik alanlar ve CMS eşleştirmeleri: [source-manifest.json](source-manifest.json).

## Mevcut yapıya eklenenler

`fil-menu-v1` korunur. `presentation: catalog` isteğe bağlıdır: klasik menü 150, katalog 2000 öğeyle sınırlı; döngü/medya sahipliği/izinli kaynak URL/QR/teknik alan doğrulamaları devam eder. 1431 öğe: 168 seri +501 sunum grubu +761 kaynak seçenek +gizli logo kaydı. Medya 20MiB ve Android HTML paketi 32MiB sınırları yükseltilmez.

Katalog tamamen gömülü yerel görseller ve QR kodlarıyla tek SHA256 doğrulamalı HTML belgesidir. Kullanıcı metni `textContent` ile gösterilir; dış betik/font/çeviri servisi gerekmez. Türkçe arama, ürün grubu, bağlamdaki ebat/yüzey/renk/doku filtreleri, 24 öğe sayfalama, kategori yolu, ana sayfa/geri/seriye dönüş, galeri ve teknik özellikler bulunur. Seri mekân görseli ile seçeneğin birebir aynı olduğuna dair doğrulanmamış iddia yapılmaz. Ürün QR adresi orijinal herkese açık sayfadır; kiosk içinde harici gezinme açılmaz. Telefonun QR hedefini açması internet gerektirir; katalog gezintisi gerektirmez.

Büyük katalog üretimi, görsel JSON parçalarını iki sınırlı geçişte doğrudan tek UTF-8 Buffer’a yazar; bütün base64 verisini birden çok UTF-16 metinde tutmaz. Aynı sıralı kaynaklardan üretilen HTML baytları/metin SHA256’sı korunur. İkinci geçişte byte sayısı değişirse yayın yazılmadan hata verilir; önceki sağlam yayın kalır. Üretimdeki192MiB Node heap ayarıyla tam1431öğeli katalog gerçek HTTP yayın+önizleme bellek kontrolünden geçirilir.

Teknik metinler CMS menüsünde düzenlenebilir yapılandırmadır; fotoğraflara gömülmez. Yönetilen menü editöründe teknik alanlar `Etiket: değer` satırlarıyla düzenlenir, geçersiz satır önceki veriyi değiştirmez. Kütüphane 500'lük sayfalarla yüklenir; menü öğesi araması ilk80 sonucu gösterir. TR/EN panel tercihi katalog içeriğini değiştirmez.

İçe aktarma yalnızca CMS API'lerini kullanır. `X-Workspace-Id` ile açık kapsam; yöneticinin aktif çalışma alanı veya dil tercihi değiştirilmez. Kaynak URL/kimlik ve optimize SHA→CMS kimliği manifestte izlenir. 10 dosyalık sıralı yükleme, hız sınırına uygun bekleme ve sınırlı `Retry-After` desteği vardır; hız/sudo güvenliği gevşetilmez. Aynı SHA yeniden yüklenmez. Seri klasörleri kaynak düzlüğünü korur; byte düzeyinde ortak görsel tek kayıtla paylaşılır.

## Medya ve tekrar üretim

Özgün dosyalar/HTML/PDF ve ağır işlemler Minix `private/etili-source` altında; VPS'ye optimize yayın dosyaları aktarılır. Kişisel giriş bilgileri manifestte bulunmaz. Kaynak önbelleği, ürün HTML hash'i, indirme tarihi ve özgün/optimize hash'ler saklanır.

```bash
cd /home/kado/filsign/repo
python3 scripts/fil/etili/discover.py --cache /home/kado/filsign/private/etili-source
python3 scripts/fil/etili/crawl.py --cache /home/kado/filsign/private/etili-source
python3 scripts/fil/etili/download.py --cache /home/kado/filsign/private/etili-source
node scripts/fil/etili/optimize.cjs /home/kado/filsign/private/etili-source
node scripts/fil/etili/films.cjs /home/kado/filsign/private/etili-source
node scripts/fil/etili/source-videos.cjs /home/kado/filsign/private/etili-source
node scripts/fil/etili/import.cjs /home/kado/filsign/private/etili-source --media --organize --films --site-videos --playlists --publish
node scripts/fil/etili/catalog.cjs /home/kado/filsign/private/etili-source
node scripts/fil/etili/import.cjs /home/kado/filsign/private/etili-source --configure --publish
```

Bu komutlar çalışan kurulumun yeniden kurulması değildir. `crawl/download` önbelleği kullanır; yeniden kaynak güncellemesi için önce manifest sürümü ve kaynak değişikliği değerlendirilir. `image-sources.json` keşfedilmiş gerçek URL envanteridir. Araçlar mevcut Node22/Sharp/QRCode ve FFmpeg kullanır. `brand-ui/brand-surfaces.cjs` tek seferlik kaynak geçiş araçlarıdır; normal içerik güncellemesinde çalıştırılmaz; gerekiyorsa Acorn modülü `FIL_ACORN` ile sağlanır. Uygulama bağımlılıkları değişmez.

Yayın listeleri için aynı kaynaklardan 11 yüksek çözünürlüklü sunum kartı da hazırlanır: portre 6, yatay 5. Kartlar gerçek 1080×1920/1920×1080 sahne çıktılarından JPEG90/4:4:4 olarak üretilir; katalogdaki küçük önizlemeler TV yayını yerine kullanılmaz. Kartların kaynak ilişkisi storyboard sahne numarasıyla manifestte korunur.

Filmler: 12 × 6 sn = 72 sn, 1080×1920 ve1920×1080, 24fps, MP4/H.264/yuv420p, ses akışı yok; hafif yakınlaşma ve krem zemin geçişi. Yatayda oranı korunan seri mekânı ve gerçek ürün yüzeyi yan yana; portrede dokunma çağrısı, TV sürümünde dokunma çağrısı yok. `films/storyboard.json` kaynak ilişkileri, `commands.jsonl` gerçek üretim komutlarıdır. Başlangıç/orta/son/geçiş kareleri ve tam decode ayrıca doğrulanır.

Resmî kaynak videoları `private/etili-source/source-videos/` altında tutulur. Video kimlikleri: `RyLMG6KhfZo`, `sZXs46XHNj8`, `GePrzEQoofw`. `yt-dlp` yalnızca Minix’te özel araç ortamında kullanılır; gerçek indirme URL’leri/tokenları içeren ham sağlayıcı JSON’u özel önbellekten çıkarılmaz. Yeniden edinme gerekiyorsa mevcut yt-dlp ile bu herkese açık izleme URL’lerine `--no-playlist --retries 0 -f 'bv*+ba/b' --merge-output-format mkv` uygulanır. Derleme ve FFmpeg komutları kaynak önbelleğinde saklanır. Türevler H.264/yuv420p ve AAC'dir; kaynak oranı korunur, portrede kurumsal zemin ve dokunma çağrısı kullanılır. Listelerde tüm öğeler `muted=true`, `fit_mode=contain` olarak yayımlanır. Kaynağın mevcut sesi korunur ve panelden açılabilir; yeni müzik eklenmez. Kaynak müziğinin lisansı bağımsız doğrulanmadığı için sunum sessiz tutulmalıdır; ses açılması operatörün ayrıca doğruladığı haklara bağlıdır. Liste yeniden içe aktarıldığında güvenli varsayılan sessiz durum uygulanır.

## Marka ve uyumluluk sınırları

Ana sayfa ve `/app` ilk HTTP HTML yanıtında FILSign title/description/canonical/OG/Twitter taşır. Paylaşım görseli `/assets/fil-share.png`,1200×630; özel panel veya müşteri bilgisi içermez. Favicons, PWA ikonları/manifest, giriş/panel/rapor etiketleri, web player ve Android görünen adları FILSign olur. Platformun mevcut branding kaydı yalnızca `brand_name` alanıyla güncellenir; diğer özel ayarlar korunur.

MIT lisansı/telifler, upstream şablonların **gerçek yazarı**, kaynak depolar, User-Agent/native bridge/service/paket/teknik dosya isimleri ve API hata eşleme anahtarları korunur. Upstream donanım test kataloğunun başlığı FILSign, test kaynağı ScreenTinker olarak açıkça belirtilir: bu kayıtlar FILSign donanım kabulü değildir. Harici mağazadaki upstream uygulamaların yeniden adlandırıldığı iddia edilmez. Sosyal platformların eski önizleme önbelleği, doğru ham HTML ve görselin canlı sunulmasından ayrı bir durumdur; gerçek platform yenilemesi yapılmadan PASS denmez.

Android görünen marka için10002/1.0.1-fil gerekir; içerik güncellemesi sonraki APK derlemelerini gerektirmez. Paket `com.fil.signage.player`, mevcut imza ve eşleşmeler korunur. Sunucu adresi kurulum ekranında ayarlanır: https://signage.filteknoloji.com.

## Kabul ve sunum

Menü/medya/playlist yayımlamak, fiziksel cihazda indirme tamamlandı anlamına gelmez. Cihaz ancak menü sürüm+SHA uygulama bildirimi ve playlist dosyalarının tamamlanmış önbelleği doğrulanınca sunuma hazırdır. Yarım menü indirmesinde önceki doğrulanmış sürüm korunur. Tablet: hybrid_kiosk60+10 veya yalnızca seçilen cihaza20+5; TV:signage_only/yatay playlist. Mevcut belirsiz PC cihazı atanmaz.

Fiziksel tablet/TV testleri cihaz bağlanana kadar **NOT RUN**. Gerçek tarayıcıdaki çevrimdışı katalog gezinmesi ve Kotlin testleri Android donanım testi olarak raporlanmaz. Kesin canlı kimlikler, test kanıtları, dosya boyutları, APK SHA ve5dakikalık operatör akışı proje `private/HANDOFF.md` belgesinde güncellenir.

Araştırma: [WooCommerce Store API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/), [WP pagination](https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/), [Etili Seramik](https://etiliseramik.com/). Kaynak dosyalarının bu demo izni, ilgisiz üçüncü taraflara genel içerik lisansı vermez.

# Ekran ve durum envanteri

Kaynak envanteri: 53 yönetim görünümü; merkezi tr/en kaynaklarında 10.384 anahtar.
Her iki sözlükte anahtar/placeholder çokluğu, boş değer, UTF-8 ve yinelenen tanımlar otomatik kontrol edilir.
Bu sayılar tek başına ekran veya akış kabulü olarak kullanılmaz.

Son izole tarayıcı turu: **71 rota, Türkçe ve İngilizce; 0 yakalanmamış JavaScript hatası, 0 masaüstü yatay taşması**.
Tur, sayfanın açılmasını ve dil değişimini doğrular. Bir dış sağlayıcıya gerçek işlem yapılmış olduğu anlamına gelmez.

| Kaynak görünüm | Doğrulanan yüzey | Kaynak/çeviri kontrolü | TR/EN tarayıcı |
|---|---|---|---|
|accessibility.js|/accessibility|Tamamlandı|PASS|
|activity.js|/activity|Tamamlandı|PASS|
|admin-player-debug.js|/admin/player-debug|Tamamlandı|PASS|
|admin.js|/platform/* (10 sekme)|Tamamlandı|PASS|
|ai-setup.js|/ai-setup; /simple/ai-setup|Tamamlandı|PASS|
|alerts.js|/alerts|Tamamlandı|PASS|
|audience.js|/audience|Tamamlandı|PASS|
|automation.js|/automation|Tamamlandı|PASS|
|billing.js|/billing|Tamamlandı|PASS|
|cap-feeds.js|/emergency-feeds|Tamamlandı|PASS|
|content-library.js|/content|Tamamlandı|PASS|
|corporate.js|/corporate|Tamamlandı|PASS|
|dashboard.js|/|Tamamlandı|PASS|
|data-sources.js|/data-sources|Tamamlandı|PASS|
|delete-account.js|/delete-account|Tamamlandı|PASS|
|designer.js|/designer|Tamamlandı|PASS|
|device-detail.js|/device/:id|Tamamlandı|PASS|
|energy.js|/energy|Tamamlandı|PASS|
|experiments.js|/experiments; /experiments/new|Tamamlandı|PASS|
|fil-kiosk.js|/kiosk/:id|Tamamlandı|PASS|
|force-password-change.js|Koşullu /change-password|Tamamlandı|PASS|
|freshness.js|/freshness|Tamamlandı|PASS|
|help.js|/help; /simple/help|Tamamlandı|PASS|
|kiosk.js|/kiosk|Tamamlandı|PASS|
|layout-editor.js|/layouts|Tamamlandı|PASS|
|login.js|/login (gerçek giriş/çıkış testleri)|Tamamlandı|PASS|
|make-sign.js|/signs; /simple/sign|Tamamlandı|PASS|
|migrate.js|/migrate; /simple/import|Tamamlandı|PASS|
|no-workspace.js|Koşullu /no-workspace|Tamamlandı|PASS|
|noc.js|/noc|Tamamlandı|PASS|
|onboarding.js|/onboarding|Tamamlandı|PASS|
|org-import.js|/org-import|Tamamlandı|PASS|
|playlists.js|/playlists; /playlists/:id|Tamamlandı|PASS|
|privacy.js|/privacy|Tamamlandı|PASS|
|qr-codes.js|/qr-codes|Tamamlandı|PASS|
|reports.js|/reports|Tamamlandı|PASS|
|requests.js|/requests; /simple/requests|Tamamlandı|PASS|
|reviews.js|/reviews|Tamamlandı|PASS|
|schedule.js|/schedule|Tamamlandı|PASS|
|servers.js|/servers|Tamamlandı|PASS|
|settings.js|/settings|Tamamlandı|PASS|
|simple-home.js|/simple/change, upload, passkey, share, team|Tamamlandı|PASS|
|simple-news.js|/simple/news|Tamamlandı|PASS|
|site-caches.js|/site-caches|Tamamlandı|PASS|
|slides.js|/slides|Tamamlandı|PASS|
|social.js|/social|Tamamlandı|PASS|
|teams.js|/teams|Tamamlandı|PASS|
|templates.js|/templates|Tamamlandı|PASS|
|translate.js|/translate|Tamamlandı|PASS|
|triggers.js|/triggers|Tamamlandı|PASS|
|video-wall.js|/walls|Tamamlandı|PASS|
|widgets.js|/widgets|Tamamlandı|PASS|
|workspace-members.js|/members|Tamamlandı|PASS|

Ortak bileşenler de kapsamdadır: üst dil seçici, sade/gelişmiş gezinme, modal/diyaloglar, toast,
çalışma alanı/kullanıcı/rol etiketleri, medya seçici ve yükleme kuyruğu, hata/boş/yükleniyor
durumları, onay ve doğrulama, sürüm geçmişi, yardım/Sürüm notları, yerleşim/şablon metadata etiketleri,
grafik/tarih/sayı biçimleri, backend hata sunumu. Sistemle gelen içerik örnekleri kullanıcı
tarafından yayımlanabilen veri olarak korunur; panel etiketleri ile karıştırılmaz.

## Gerçek işlem kabulü

| Akış / durum | Sonuç | Kanıt |
|---|---|---|
| Giriş, çıkış; geciken giriş yapılandırması | PASS | fil-admin-language-e2e; fil-kiosk-e2e |
| İlk Türkçe, yenileme, hesaplar/tarayıcılar arasında tercih; hızlı dil değişimleri | PASS | fil-admin-language-e2e |
| Gerçek PNG yükleme, reddedilen dosya, yerelleştirilmiş hata, arama filtresini koruma | PASS | fil-admin-flows-e2e |
| Liste oluşturma/düzenleme, kaydedilmemiş ad/açıklama ve aynı DOM; medya ekleme/yayımlama | PASS | fil-admin-flows-e2e |
| Menü içeriği, taslak kaydet/yayımla, iç içe alanlar, profil ve player iframe koruması | PASS | fil-admin-language-e2e; fil-kiosk-e2e |
| Zamanlama kaydetme, aynı saatleri koruma; geciken isteğin başka sayfayı bozmaması | PASS | fil-admin-flows-e2e |
| Çalışma alanı yöneticisi/editörü/izleyicisi, kuruluş sahibi/yöneticisi, platform operatörü | PASS | fil-admin-role-e2e |
| İzleyicinin yazma isteğinin 403 ile reddi, Türkçe erişim reddi | PASS | fil-admin-role-e2e |
| Zorunlu parola ekranı, kaydedilmemiş parola alanı; çalışma alanı olmayan hesap ve çıkış | PASS | fil-admin-conditional-e2e |
| Özel karakterli adlarla silme onayı: aynı ad, tam eşleşme şartı, HTML çalıştırmama | PASS | fil-admin-language-e2e |
| Bağlantı durumu iki dilde doğru; bilinmeyen sunucu hatası ve XSS sınırları | PASS | fil-admin-language-e2e; fil-admin-catalog |
| Türkçe İ/i I/ı arama/sıralama, tarih/sayı/yüzde, virgüllü sayı girişi | PASS | fil-admin-locale; content-search-filter-sort; fil-admin-language-e2e |
| Gerçek Chrome %200 yakınlaştırma, dar ekran, klavye/diyalog odağı | PASS | fil-admin-zoom-e2e |
| Önbellek sürümü ve oynatıcı/medya önbelleklerinin korunması | PASS | fil-admin-cache |
| Gerçek tablet / TV / TV box | NOT RUN | Fiziksel cihaz yok; yazılım testleri yerine sayılmaz |

## Sınırlar ve denetim yöntemi

Kaynak taraması yalnızca regex sonucu değildir: HTML metinleri, JS sabitleri, template
literal parçaları ve dinamik enum etiketleri birlikte incelendi; kalan sabitler bağlamıyla
sınıflandı. Son HTML taramasındaki 20 aday; HTTP/UDP/CPU/URL/NOC/QR/EDID/SI birimleri,
algoritma/ürün adları, CSS şablon işaretleri ve kullanıcıya sunulan değiştirilebilir Hello World
örnek içeriğidir. Bunlar panel cümlesi yerine çevrilmez. Özel şablonların ve kullanıcı
medyasının kendi metinleri değiştirilmez. Beş sistem şablonunun parametre etiketleri ve
sistem yerleşimlerinin görünen adları ayrıca denetlenir.

Dış sağlayıcı kimlik doğrulaması/ödeme/AI/SCIM entegrasyonlarının gerçek uzak işlemleri bu
dil görevi için canlı hesaplarla denenmedi. Yerel kullanılabilirlik, yetki, boş durum,
ayar ve hata yüzeyleri incelendi; sağlayıcının kendi sayfası panel tarafından çevrilemez.
Tarayıcı/OS dosya seçicisi ve yerel doğrulama balonları platform diliyle çalışabilir.

Görsel örnekler izole test verisiyle gerçek Chrome üzerinden alındı: medya kütüphanesi,
cihazlar, listeler, ayarlar, yardım ve %200 diyalog. Çeviriler ekran bağlamı ve terim
sözlüğü ile ayrıca dil kontrolünden geçirildi. Canlı dağıtım durumu ve commit, özel
HANDOFF belgesinde ayrı izlenir; bu matristeki PASS canlıya dağıtım kanıtı değildir.

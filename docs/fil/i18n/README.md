# Yönetim paneli Türkçe/İngilizce yerelleştirme

Durum: uygulama ve izole kabul testleri tamamlanıyor. Canlı dağıtımın sonucu özel teslim belgesinde ayrıca kaydedilir; kaynak belgesi canlıya alınmış sürümün kanıtı değildir.

Mevcut bağımsız JavaScript modülleri ve t/tn sözlük düzeni korunur. Varsayılan Türkçedir.
Mevcut hesap tercihine `users.ui_language` (tr/en) eklenmiştir. Oturum açıkken seçim,
mevcut GET/PUT /api/auth/me sözleşmesiyle hesaba kaydedilir; başka tarayıcıda da uygulanır.
Hesap başına yerel önbellek ayrı tutulur; bir hesabın tercihi başka hesaba aktarılmaz.
Giriş yapmadan seçilen dil tarayıcıda saklanır; girişte açık seçim hesaba kaydedilir.
Sunucuya yazma başarısızsa kullanıcı uyarılır ve aynı hesabın önbelleği yeniden denemek için korunur.
Tarayıcı dili açık seçimin önüne geçmez. Storage engelliyse arayüz bellek tercihiyle çalışır.


Dil değişimi hashchange/yönlendirme yapmaz. Kaynak t/tn çağrılarında açık anahtar ve
değişken taşıyan HTML yorum aralıkları/attribute bağları yalnızca sistem metnini
günceller. DOM metninde sözcük veya sözlük eşleştirmesi yapılmaz. Form düğümleri,
kullanıcı verileri, düzenleyici modeli, odak, filtre ve player iframe korunur.
HTML biçimlendirme yalnızca sınırlı sabit etiketlerdir; değişkenler ayrı escape edilir.

Panel dilinin player/menü içeriğine veya saat dilimine etkisi yoktur. Native date,
time ve number input değerleri API biçiminde kalır. Görüntü biçimi için Intl/tr-TR
ve en-US; metin aramasında Türkçe locale, teknik kimliklerde mevcut kurallar.

Araştırma ve karar kaynakları:
- https://www.w3.org/International/questions/qa-html-language-declarations — html lang, dil adlarında ayrı lang.
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl — sayı/tarih/Collator.
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLocaleLowerCase — İ/i ve I/ı.

Tarayıcı/işletim sistemi dosya seçici ve parola yöneticisi kendi dil ayarlarını kullanır.
Ürün adları, API/enum/URL ve kullanıcı içerikleri çevrilmez. Fiziksel Android player
bu görevin kapsamı değildir; APK ve imzalama anahtarı değiştirilmez.

Native number kontrolleri korunur; API .value/valueAsNumber kanonik kalır. Bazı İngilizce
Chromium sürümleri lang=tr olsa bile “1,5” girişini sessizce “15” yapar; gerçek tarayıcıda
bu durum yeniden üretildi. Virgül ve yerelleştirilmiş pano sayıları native insertText ile
normalleştirilir; caret/selection/undo korunur, alanın tamamı üzerine yazılmaz. Bu dar
uyumluluk kullanımı için MDN execCommand belgesindeki undo gerekçesi incelendi. API
deprecated olduğundan başarısızlıkta alan zorla değiştirilmez; yerelleştirilmiş uyarı
verilir ve nokta/geri silme ile devam edilir. Native min/max/step ve sunucu doğrulamaları
aynen korunur. Gruplama içermeyen kanonik programatik değerler değiştirilmez.
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number
- https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand


Sözlükler `frontend/js/i18n/{tr,en}.js` içindedir. Çeviriler dış servis olmadan
çalışır. `message`/`messageCount` kaynak anahtarını ve değişkenleri; `displayValue`,
`displayList` ve `displayQuantity` ise görüntü biçimini taşır. Eksik anahtarda önce
İngilizce, anahtar iki dilde de bilinmiyorsa anlaşılır genel hata kullanılır.
`api-message-keys.js`, sunucunun mevcut hata sözleşmesini değiştirmeden bilinen
mesajları yerelleştirir; bilinmeyen teknik hata kullanıcıya aynen gösterilmez.

Sistemle gelen yerleşim adları ve şablon alanlarının etiketleri yalnızca görüntüde
çevrilir. Kullanıcının değiştirdiği adlar, yüklediği şablonlar ve yayımlanan içerik
bu eşlemeye girmez. Yazı tipi adları korunur; sistemin yazı tipi kullanım
önerileri çevrilir. Hesap dili, içerik üretiminde seçilen dilin yerine geçmez.

Yönetim service worker sürümü bu değişiklik için artırılmıştır. Yalnızca eski
`rd-admin-*` önbellekleri temizlenir; oynatıcı, medya ve site önbellekleri silinmez.
Statik dil kaynakları tek sürümün önbelleğinden okunur.

Dil değişimi tarih girişlerinin kanonik değerini, kayıtlı UTC verisini, sunucunun
saat dilimini veya zamanlama anını değiştirmez. Native sayı alanında görüntü ve
klavye davranışı için yukarıdaki dar uyumluluk kullanılır. Dosya seçici, işletim
sistemi izin pencereleri, tarayıcı parola yöneticisi ve üçüncü tarafın kendi gömülü
sayfası panel çevirisinin denetimi dışındadır. Sağlayıcı/ürün adları, teknik
protokoller, komutlar, JSON örnekleri ve kullanıcı içeriği dil değişiminde korunur.

Doğrulama komutları (`server/` içinden):

```sh
npm run check:admin
CHROME=/gercek/chrome/yolu npm test
```

`fil-admin-*` testleri iki sözlüğün anahtar/placeholder çokluğunu, güvenli geri
dönüşü, XSS sınırlarını, hesap tercihini, İngilizce/Türkçe aramayı ve Intl biçimini,
önbellek ayrımını ve gerçek tarayıcı akışlarını denetler. Tarayıcı testleri geçici
sunucu/veritabanı ve test hesabıyla çalışır; canlı kullanıcı verisine yazmaz.
`fil-admin-zoom-e2e` tarayıcının gerçek %200 yakınlaştırmasını kullanır.
CI ayrıca modül grafiği, tüm sunucu testleri ve bağımlılık güvenlik kontrolünü çalıştırır.
Tarayıcı bulunmayan CI koşusundaki SKIP, Minix'te çalıştırılan tarayıcı kabulünün
karşılığı sayılmaz. Ekran/durum matrisi [COVERAGE.md](COVERAGE.md), terimler
[GLOSSARY.md](GLOSSARY.md) belgesindedir.

Çeviri değişkenlerine ham değer verilir; `esc()` uygulanmış metin verilmez. HTML kaçışı
`uiText`/`renderHTML` çeviri sınırında bir kez yapılır. Böylece ad içindeki `&` ve
`<` doğru görünürken HTML olarak çalışmaz; silme onayında yazılması gereken gerçek
ad değişmez. Bu sınır gerçek onay penceresiyle regresyon testine dahildir.

Hata gösteriminde `errorMessage(error)` kullanılır. Sunucu yanıtının kodu, gövdesi,
status değeri ve teknik Error.message sözleşmesi değişmez; UI için uiMessage
ayrı tutulur. Yerel olarak üretilen çevirili hatalar `localizedError(message(...))`
ile anahtarını korur. Böylece açık hata görünümü de dil değiştirebilir. Bilinmeyen
sunucu/ağ hatası arayüzde genel, yerelleştirilmiş bir açıklamayla sunulur. Teşhis
amacıyla kullanılan ham hata sınıflandırmaları ve günlükler bu sunumdan ayrıdır.
Ad aramasında medya/klasör/çalışma alanı/üye seçicileri de etkin locale ile
harf dönüşümü yapar; MIME, enum, slug, e-posta kaydı, tag/API kimliği ve klavye
komutlarının kanonik kuralları değiştirilmez.

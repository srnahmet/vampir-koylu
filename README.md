# Vampir Köylü

Moderatörsüz, aynı masada herkesin kendi telefonundan oynadığı Türkçe parti oyunu. Piksel köyü, yumuşak gündüz/gece geçişleri, dört renk paketi, QR kodla katılım ve gizli roller.

GISM 🤝 SPTLS ortak yapımı.

## Masa hakları ve gizli rol çekilişi

Her tarayıcı kimliği son 60 dakikada en fazla **10 masa** kurabilir. Ana menüde kalan hak, kullanılan haklar ve sıradaki yenilenme süresi gösterilir. Her hak kendi kullanımından 60 dakika sonra geri gelir. Sayaç sunucudan okunur; sayfa yenilemek, sekme değiştirmek veya oyun bitirmek hakları sıfırlamaz. Başka masalara katılmak hak tüketmez. Aynı kurucunun eşzamanlı oluşturma istekleri veritabanında sıraya alınır.

Doktor ve **Soytarı** için üç seçenek vardır: **Kesin olsun**, **Şansa bırak**, **Olmasın**. Şansa bırakılan her rol için oyun başlatılırken sunucuda bağımsız %50 çekiliş yapılır; iki rol de gelebilir, sadece biri gelebilir veya hiçbiri gelmeyebilir. Kurucu dahil kimse çekiliş sonucunu öğrenmez; herkes yalnızca kendi rolünü görür. Ayarlarda çekilişin sonucu yerine seçilen mod görünür. Doktor şansa bırakılmışsa doktor çıkmasa veya elenmiş olsa da gece ikinci asgari süreyi bekler; hiç doktor yokken hamle bekleyip kilitlenmez. Eski boolean rol ayarları desteklenir.

Muhtar, Koruma, Avcı, Şaman, Silahşör ve Yavru Vampir ana menüde kendilerine özel SVG piksel karakterleriyle **Yakında** olarak görünür. Bu altı rol seçilemez ve oyunda dağıtılmaz; özellikleri henüz oyuna eklenmemiştir.

Kartların **Özellikler** bölümündeki tanıtımlar: Muhtarın oyu iki sayılır; Koruma saldırıya uğrayan hedefinin yerine ölür; Avcı ölürken seçtiği bir oyuncuyu yanında götürür; Şaman her gece bir köylüyü susturur, hedefi ertesi gün tartışmada konuşamaz ama oy verebilir ve konuşursa elenir; Silahşör bir kez seçtiği bir oyuncuyu vurabilir; Yavru Vampir idam edilirse vampir ertesi gece iki kişiye saldırabilir. Bunlar kullanıcı tarafından onaylanan gelecek rol taslaklarıdır; şu anki oyun motorunda etkin değillerdir.

Vampirin öldürdüğü oyuncu, ölüm kesinleştikten sonra yalnızca kendi ekranında piksel vampir dişleri ve hafif kan izleriyle kısa bir sahne görür. Doktorun kurtardığı oyuncuya, diğer oyunculara veya izleyici kurucuya bu sahne gösterilmez. Sahne kapatılabilir veya 8 saniye sonra kendiliğinden kapanır; aynı tarayıcı sekmesinde onaylandıktan sonra tekrar gösterilmez. Azaltılmış hareket tercihi animasyonları durdurur.

## Paylaşım ekranı ve konuşma sırası

Masa kurarken **Ben de oynayacağım** veya **Yalnızca masayı yönet** seçilir. İkinci seçenekte isim istenmez; kurucuya oyuncu kaydı, numara veya rol verilmez. Masa sahibi oyunu başlatıp ortak akışı izler. Ekranında özel rol kartı, gece hedefi veya oylama sırasında gizli oy sayıları bulunmaz. Oyun bitince açıklanan roller herkes için ortaktır. Başlamak için kurucu hariç en az 4 gerçek oyuncu gerekir.

İlk konuşmada **Geceye geçelim**, sonraki gündüz ve ek tartışmada **Oylamaya geçelim** düğmesi bulunur. İstekler geri sayımın hemen altında görünür; yaşayanların salt çoğunluğu oluşunca geçilir. İzleyici kurucu bu isteklere oy veremez. Gece ve oylama asgari süreleri atlanamaz.

**Sıra bazlı konuşma** açıldığında her gündüz yaşayan oyuncular için yeni bir rastgele sıra oluşturulur. Aynı sıra iki tur döner. Toplam gündüz süresinin yaklaşık üçte ikisi bu iki tura eşit bölünür; kalan süre serbest tartışmadır. Konuşmacı **Sözümü bitirdim** ile erken geçebilir, süre dolunca otomatik geçilir. İki tur tamamlanınca **Şimdi söz hepinizde!** görünür. Konuşma sırası veritabanında tutulur; bütün ekranlar aynı konuşmacıyı görür. Konuşma turları gündüz saatini veya erken geçiş oylarını sıfırlamaz. Kalabalık masalarda gündüz süresini uzatabilirsiniz.

Gece, oylama, ölüm, idam, doktor kurtarışı, rol dağıtımı ve üç kazanma durumu için ayrı SVG piksel sahneleri ve CSS animasyonları vardır. Ölen veya konuşan kişinin özel rolü görselden açığa çıkmaz; nötr köy sakini çizimleri kullanılır. Azaltılmış hareket tercihi animasyonları durdurur.

## İsteğe bağlı sesli sohbet

**Masada sesli sohbet** varsayılan olarak kapalıdır. Kurucu yalnızca **Sıra bazlı konuşma** açıkken etkinleştirebilir; sıralı konuşma kapatılırsa ses ayarı da kapanır. Her oyuncu ayrıca **Sesli sohbete katıl** seçer. Katılmak mikrofon izni istemez veya mikrofonu açmaz. Mikrofon yalnızca oyuncunun kendi sırasında ve toplu konuşmada, oyuncunun düğmeye basmasıyla açılır. Sıra değişince, süre dolunca, başka aşamaya geçilince, oyuncu elenince veya sekme arka plana alınınca ses izi durdurulur. Sonraki sırada kendiliğinden açılmaz. İzleyici kurucu ve elenenler yalnızca dinleyebilir.

Gerçek ses etkinliği oyuncunun yanında **Konuşuyor** göstergesiyle görünür; sessiz ama açık mikrofon ayrı gösterilir. Diğerlerinin sesini kapatma ve sesten ayrılma düğmeleri vardır. Ses kaydı tutulmaz. Mikrofon HTTPS (veya localhost) ve tarayıcı izni gerektirir.

Ses WebRTC ile tarayıcılar arasında aktarılır. Supabase yalnızca aynı masadaki kimliği doğrulanmış üyeler arasında bağlantı mesajlarını taşır; roller veya kullanıcı kimlikleri bu mesajlara eklenmez. Varsayılan kapalıyken ses için bağlantı, mikrofon erişimi veya ek sorgulama yapılmaz. Katılanlar için saniyede bir kısa sinyal/oturum sorgusu çalışır. Sinyaller iki dakika, sessiz kalan bağlantı kayıtları yirmi saniye sonra sonraki sorguda temizlenir.

Ses açıkken internet, pil, işlemci ve Supabase sorgu kullanımı artar. Her katılımcı diğer katılımcılara ayrı bağlantı kurduğundan kalabalık masalarda maliyet ve gecikme büyür; kulaklık önerilir. Bu uyarı masa ayarlarında ve ses panelinde gösterilir. Kurulum STUN kullanır; **TURN aktarım sunucusu içermez**, bu nedenle bazı mobil, okul veya iş ağlarında ses bağlantısı kurulamayabilir. Geniş ağ uyumluluğu için ayrıca kimliği doğrulanmış TURN hizmeti gerekir. Bu sürümde TURN erişim bilgileri veya ücretli servis eklenmemiştir.

## Çalıştırma

Node.js 22 veya 24 ile:

```sh
npm ci
npm run dev
```

Üretim dosyaları: `npm run build` → `dist/`. Çıktı tamamen statiktir; GitHub Pages'te çalışır. Sunucu çalıştırmanız gerekmez. Davetler `?oda=ABC123` kullanır, bu yüzden sayfa yenilemelerinde 404 oluşmaz.

## Supabase

Bu sürüm `pdqtsrwclrfenmrtsluh` projesine bağlıdır. Kaynak koddaki `sb_publishable_…` anahtarı, tarayıcıda paylaşılmak için tasarlanan açık anahtardır. Gizli veya service-role anahtarı içermez.

Başka projeye taşırken:

1. Supabase SQL Editor'de `supabase/setup.sql` dosyasını çalıştırın. Mevcut oyun verilerini silmez.
2. Authentication → Sign In / Providers → **Allow anonymous sign-ins** ayarını açıp kaydedin.
3. `.env.example` dosyasını `.env.local` olarak kopyalayın. Yeni proje URL'sini ve **publishable** anahtarını yazın.
4. `npm run build` komutunu çalıştırın.

GitHub Actions'ta farklı proje kullanmak için aynı `VITE_…` değişkenlerini build adımının `env` alanına ekleyin. Varsayılan proje için ek ayar gerekmez.

## GitHub Pages

Settings → Pages → Source: **GitHub Actions**. `main` dalına gönderilen her değişiklik önce test edilir, ardından derlenip yayınlanır. İş akışı `.github/workflows/pages.yml` içindedir.

## Oyun kuralları

- 4–24 oyuncu; tam 1 vampir, isteğe bağlı en fazla 1 doktor ve 1 soytarı, kalanlar köylü. İsteğe bağlı roller kesin eklenebilir, şansa bırakılabilir veya kapatılabilir. Roller sunucuda rastgele dağıtılır. Numaralar sabit kalır.
- Roller 7 saniye gösterilir, ardından 5 saniye geri sayım yapılır.
- İlk konuşmadan sonra ilk gece başlar. İlk konuşmada idam yoktur; yaşayanların salt çoğunluğu ile geceye erken geçilebilir.
- Sonraki gündüzlerde süre bitince oylama açılır. Yaşayanların yarısından fazlasının isteğiyle erken açılabilir.
- Çoğunluk = `floor(yaşayan / 2) + 1`. Ölüler oy kullanamaz. Kendine oy yoktur. Kesinleşmiş oy değişmez. Sayılar yalnızca kendi oyunu verenlere görünür.
- Oylama en az belirlenen süre kadar sürer; ayrıca yaşayan herkesin oy vermesi beklenir. Çoğunluk çıkmazsa ek tartışma başlar, ardından boş oylarla yeni tur açılır.
- Vampir hedefini seçer. Varsa yaşayan doktor, hedefi bilmeden sonrasında koruma seçer. Ölüm ancak iki aşama tamamlanınca uygulanır. Doktor hedef olmuş olsa bile o gece hamle yapar.
- Her gece hamlesi en az belirlenen süre kadar sürer ve seçim yapılmadan tamamlanmaz. Doktor kendini tüm oyunda bir kez, başkalarını tekrar tekrar koruyabilir.
- Vampir idam edilirse köylüler ve doktor, elenmiş olsalar da kazanır.
- Soytarı idam edilirse yalnızca soytarı kazanır ve oyun anında biter. Gece öldürülürse kaybeder.
- Vampir hayattayken 3 veya daha az yaşayan oyuncuyla gece başlayacaksa kazanır. Gece 4 kişiden 3 kişiye düşülmesi gündüzün oynanmasına engel olmaz.
- Ölüm sonrası roller gizli kalır, oyun sonunda tüm roller açılır.
- Bağlantısı kopan kişi aynı tarayıcıyla geri dönebilir. Masayı kuranın ayrılması devam eden oyunu durdurmaz. Eksik hamle veya oy varsa sınırsız beklenir; otomatik oyuncu eleme yoktur.

Süreler masa kurulurken ayarlanır: gündüz 30–1800 sn (varsayılan 300), her gece hamlesi 15–120 sn (15), oylama 20–120 sn (20), ek tartışma 15–300 sn (60). Oyun içi sonuç duyuruları 7 sn sürer. Çok vampirli mod, "Yakında" bilgisiyle kapalıdır.

## Teknik yapı ve doğrulama

React + TypeScript + Vite. Fontlar ve tüm görseller projeyle birlikte gelir; harici font servisi veya görsel servisi gerekmez. Karakter ve köy illüstrasyonları SVG'dir. Mobil tarayıcılar için manifest, güvenli alanlar, dokunma hedefleri, klavye erişimi ve azaltılmış hareket desteği bulunur.

Oyun motoru PostgreSQL fonksiyonlarıdır. `vk_private` şeması HTTP API'ye açık değildir. Tablolarda RLS açık, istemcilere doğrudan tablo izni yoktur. Dokuz dar kapsamlı RPC, oturum kimliğini, masa üyeliğini, rolü, hedefi ve aşamayı kontrol eder. Roller sadece sahibi için döndürülür. İzleyici kurucu için `me` alanı `null` döner. Tur kilidi eşzamanlı hamleleri sıraya koyar; aşama ve konuşma sırası numaraları eski istekleri reddeder. Zamanı veritabanı belirler. İstemciler 1,8 saniyede bir durumu alır; host telefonuna veya ayrıca zamanlayıcı servisine bağımlılık yoktur.

`supabase/setup.sql`, mevcut kurulumu da yükseltir. Sütunları ekler ve fonksiyonları yeniler; mevcut masa ve oyuncuları silmez. Eksik yeni ayarlar eski masalarda varsayılan davranışı korur.

```sh
npm test
npm run build
```

Testler aynı SQL dosyasını PGlite üzerinde gerçek PostgreSQL motorunda çalıştırır. Çoğunluk, berabere oylar, süre sınırları, gizli oylar, rol dağıtımı, doktor, soytarı, kazanma anı ve yetkisiz erişim senaryolarını kapsar.

## İşletim notları

Misafir kimliği aynı tarayıcıda saklanır. Tarayıcı verileri silinirse veya başka telefona geçilirse aynı kimlik geri alınamaz. Ücretsiz Supabase projesi hareketsizlikten duraklatılabilir; gerekirse panelden uyandırılır. İnternet gerekir. Yeni anonim girişler sağlayıcının hız sınırına tabidir; mevcut oturumlar tekrar kullanılır.

Masalara yeni katılım 24 saat sonra kapanır. Kayıtlar otomatik silinmez; kullanım büyüdüğünde eski masalar için saklama süresi/temizleme görevi eklenmelidir. İsim dışında kişisel veri istenmez. Aynı kurucu son 60 dakikada 10 masa açabilir. Kalan haklar ana menüde görünür; kullanılan her hak 60 dakika sonra yenilenir. Bu sürüm, arkadaş gruplarıyla kullanım için hazırlanmıştır.

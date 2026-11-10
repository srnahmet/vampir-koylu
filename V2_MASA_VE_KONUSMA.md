# Vampir Köylü V2 — 2.0.0

V2; on oynanabilir karakteri, iki vampirin ortak hedef seçimini, masa düzenleme araçlarını ve yedi temayı içerir.

## Mevcut kurulumu güncelleme

1. Supabase SQL Editor'de **supabase/v2.sql** dosyasının tamamını çalıştırın. Bu dosya V1'den doğrudan V2'ye geçişi yapar; önceki iki ara V2 SQL dosyasını çalıştırmak gerekmez. Yeni kurulumda **supabase/setup.sql** de aynı kurulumu sağlar.
2. Ardından web sürümünü yayımlayın. GitHub Pages iş akışı main dalındaki değişiklikleri test eder, derler ve yayımlar.

Geçiş masaları, oyuncuları, devam eden rollerini, oyları, şifreleri ve geçmiş özetleri silmez. Yeni kolonlar eklenir ve işlevler yenilenir. SQL yeniden çalıştırılabilir. Üretimde değişiklik öncesi standart veritabanı yedeğinizi alın. Eski v4/v5 geçiş dosyalarını V2 kurulumunun üzerine uygulamayın.

## Karakterler

| Karakter | Davranış |
| --- | --- |
| Köylü | Tartışır ve oy verir; köy takımıyla kazanır. |
| Vampir | Her gece hedef seçer. Takımın tüm üyeleri elenirse köy kazanır. |
| Doktor | Her gece birini korur; kendini oyun boyunca bir kez koruyabilir. |
| Soytarı | Yalnızca idam edilerek tek başına kazanır. Atış, gece, bağlantı veya çıkarılma zafer vermez. |
| Muhtar | Oyu iki sayılır. Eşitlikte 30 saniyede eşit adaylardan birini seçer; karar gelmezse ek tartışma/oylama yapılır. |
| Koruma | Kendisi dışında birini korur. Doktor hedefi kurtarmadıysa yerine ölür. Bir gecede en fazla bir saldırıyı üstlenir; aynı gece kendisi de hedef olsa bile seçtiği kişiyi korur. |
| Avcı | Oyun içi ölümünde son bir hedef seçer. 30 saniye sonunda rastgele yaşayan hedef seçilir. Bağlantı/çıkarılma son atış vermez. |
| Şaman | Başka bir oyuncuyu ertesi gün susturur. Oy hakkı korunur, konuşma sırası ve mikrofon kapanır. Aynı ortamda sessizlik ihlalini masa sahibi “Konuştu” ile işaretler. Uygulama dışındaki konuşma otomatik dinlenmez. |
| Silahşör | İlk konuşma/gündüz/ek tartışmada tek atış yapar. Köy takımını vurursa sonraki gün başında elenir; vampir veya soytarı atışı bu bedeli doğurmaz. Susturulmuşken atış yapamaz. |
| Yavru Vampir | Vampir takımındadır. Son yetişkin elenince avlanmayı devralır. İdam edilirse sonraki gece iki farklı saldırı açar; diğer ölümler ek saldırı vermez. |

Vampir sayısı korunur. Kesin roller sığıyorsa hepsi dağıtılır; sığmıyorsa aralarından oyuncu sayısına uygun, eşit öncelikli rastgele seçim yapılır ve oyun başlar. Hangi karakterlerin seçildiği açıklanmaz. Şansa bırakılan roller bağımsız %50 çekilişle havuza girer; kalan yerler yetmiyorsa bu havuzdan da eşit öncelikli seçim yapılır. Rastgele gece rollerinin boş aşaması da beklenir; seçim sürelerinden çekiliş sonucu anlaşılmaz. Özel yetenekler ve hedefler oyun bitene kadar özet bölümünde gizlidir.

## İki vampir

En az altı oyuncu gerekir. İki vampir aynı anda hedef önerir, birbirinin önerisini görür ve süre dolana kadar değiştirebilir. Süre sonunda eksik seçim varsa geçerli öneriler kullanılır; hiç öneri yoksa yaşayan uygun hedeflerden biri rastgele seçilir. Böylece iki vampirli gece seçim yapılmadığında da ilerler. Aynı hedefte anlaşılırsa o hedef; farklı hedeflerdeyse ikisinden biri sunucuda rastgele seçilir. Seçilen hedef vampirlere gösterilir, sonra doktor ve koruma etkileri uygulanır. Vampirler takım üyelerini hedefleyemez. Bir yetişkin elendiğinde diğeriyle oyun sürer.

## Masa, konuşma ve görünüm

- İlk lobi ve rövanş lobisinde isim değiştirilebilir; masa sahibi süreleri, rolleri ve temayı değiştirebilir. Değişiklik sonrası herkes yeniden hazır olur. Masa sahibi katılım biçimi ve şifre modu mevcut masada korunur.
- Sıralı konuşma her oyuncuya iki turda da ayrı ayrı 30–300 saniye verir. İki tur bitince ayarlanan serbest sohbet süresi başlar. Konuşmacı erken bitirebilir; mevcut çoğunlukla erken geçiş de korunur.
- Yedi tema vardır. Rastgele tema ilk masada seçilir ve her rövanşta farklı bir tema gelir.
- Rol pencereleri yetenek, kazanma koşulu ve taktik içerir. Karakter galerisinde oklar ve yatay küçük kart şeridiyle gezilir.
- Eşitlik görünümü çok adaylıdır. Yeni yeteneklerde özgün piksel karakterleriyle hareketli sahneler gösterilir; azaltılmış hareket tercihi desteklenir.

## Doğrulama

`npm test` veritabanı kurallarını ve erişim sınırlarını; `npm run build` TypeScript ve üretim derlemesini denetler. `tests/v2-roles.test.mjs` tüm yeni karakterleri ve etkileşimlerini, `tests/v2-upgrade.test.mjs` mevcut oyunun yükseltme sırasında korunmasını doğrular.

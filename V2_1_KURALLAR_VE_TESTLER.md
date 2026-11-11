# Vampir Köylü 2.1

Yeni kurallar yeni dağıtımlarda kullanılır. Geçiş sırasında devam eden V2 oyunları mevcut gece aşamalarını ve seçimlerini korur; rövanşta 2.1 kurallarına geçer. Önce `supabase/v2-1.sql`, ardından web sürümü yayımlanır. SQL dosyası tekrar uygulanabilir; masalar ve oyuncular silinmez. `setup.sql` ile `v2.sql` aynı güncel kurulumu içerir.

## Ortak gece ve eşitlik sınırı

Vampirler, doktor, şaman ve büyücü aynı anda seçim yapar. Ana gece süresi 15–120 saniyedir. Herkes bir hamle veya **Pas** gönderirse ana sürenin sonunda gece çözülür. Eksik hamle varsa ayarlardaki 5 veya 10 saniye ek süre beklenir; ardından mevcut seçimler uygulanır. Hiç saldırı önerilmemişse rastgele bir masum öldürülmez. Haklar sonuç anında harcanır; değiştirilen, pas geçilen veya bağlantı nedeniyle iptal edilen hamleler hak harcamaz.

Vampirler farklı hedefler önerirse geçerli önerilerden biri eşit şansla seçilir. Yavru Vampir’in ek saldırısı da aynı pencerede, farklı ikinci hedefle seçilir. Alfa dönüşümü tüm takım saldırılarına üstün gelir.

İlk eşitlik, muhtar kararı veya eşit adaylarla ek tartışma ve yeni oylama açar. Sonraki oylamanın ikinci eşitlikte geceye geçeceği açıkça gösterilir. Art arda ikinci eşitlikte kimse idam edilmez; yedi saniyelik sonuç ekranından sonra gece başlar. Yeni gecede sayaç sıfırlanır.

## Yeni karakterler

| Karakter | Dahil olma | Taraf ve amaç | Yetenek |
| --- | --- | --- | --- |
| Büyücü | En az 8 oyuncu | Köy; vampir takımının tamamı elenince kazanır | Bir gece, kendisi dışında yaşayan iki oyuncunun rollerini ve role bağlı yetenek haklarını değiştirir. Hedeflerden biri vampir takımındaysa büyücü doğrudan ölür. Doktor bu bedeli engelleyemez. |
| Alfa Vampir | En az 8 oyuncu; başlangıçtaki yetişkin vampirlerden birinin yerini alır | Vampir takımı | Oyun boyunca bir kez, öldürmek yerine bir oyuncuyu vampire dönüştürür. O gece bütün vampir saldırıları ve varsa ek saldırı iptal olur. Doktor dönüşümü engelleyebilir; Alfa’nın hakkı yine harcanır. |
| Sapkın | En az 6 oyuncu | Bağımsız; gizli hedef oyuncunun köy kararıyla idamını ister | Köy oylaması veya muhtar idamı kişisel zaferini kesinleştirir. Oyun sürer. Sapkın daha önce ya da sonra ölse, dönüştürülse veya rolü değişse de kesinleşen zafer oyuncuda kalır. Diğer ölüm türleri görevi tamamlamaz. |

Koruma yeni masalarda dağıtılmaz. Rolü, görselleri ve eski oyun mekanikleri veritabanında/kodda korunur.

Büyüde hem aktör hem hedef aynı yer değişimine tabi tutulur. A oyuncusunun rolü B’ye taşınmışsa o role yöneltilmiş aynı gece saldırısı, koruma ve susturma da B’ye taşınır. Önceden yapılmış hamleler aktör o gece ölse veya dönüşse bile çözülür. Doktorun tek kendini koruması, silahşörün atışı ve diğer tüketilmiş haklar rolle birlikte taşınır; fiziksel susturma/vicdan etkileri oyuncuda kalır. Sapkın’ın hedefi oyuncunun kendisine dönüşürse başka yaşayan oyuncu seçilir. Gece ölmüş bir hedef sonradan idam edilmiş sayılmaz.

Rolü değişenlere kaynağı veya büyücünün kimliği gönderilmez; yalnızca “Büyülendin” bildirimi ve yeni rol/zafer koşulu gösterilir. Dönüşümü yalnızca yeni vampir öğrenir; takım arkadaşları yeni vampiri özel takım alanında görür. Ortak ekrana dönüşüm veya büyücü kimliği yazılmaz. Başka bir yetenek ölüm yaratırsa sonuç ekranı gerçek ölümleri gösterir.

Sapkın’ın başarısı rol yerine oyuncuya aittir; oyun sonunda hedef damgası ve herkesin kazandı/kazanamadı simgesi gösterilir. Soytarı zaferi daha önce kesinleşmiş Sapkın zaferini silmez. Diğer takım ödülleri oyuncunun oyun sonundaki rolüne göre belirlenir; elenmek takım ödülünü engellemez.

## Arayüz

- **Aa / yazı tipi** düğmesi piksel başlıklarını ve sayaçları okunabilir Nunito fontuna geçirir. Tekrar basınca klasik fonta döner; tercih tarayıcıda saklanır.
- Rol gösteriminde ve karakter galerisinde **Köy takımı / Vampir takımı / Bağımsız** etiketi ile kazanma koşulu bulunur.
- Lobide karakter simgesine basan masa sahibi **Kesin oynasın / Şansa bağlı / Oynamasın** seçimini doğrudan değiştirir. Değişiklik herkesi yeniden hazırlanmaya alır. Diğer oyuncuların sunucu üzerinden ayar değiştirme yetkisi yoktur.
- Karakter hikâyeleri, yeni piksel SVG modelleri ve büyü/dönüşüm etkileri uygulamanın renk paketlerine uyar. Azaltılmış hareket tercihi korunur.

## Doğrulama

| Denetim | Kapsam |
| --- | --- |
| Büyücü matrisi | **864** rol çifti × saldırı × koruma senaryosu, çözüm kodundan bağımsız hedef/ölüm modeliyle karşılaştırılır. Vampirle temas, avcıya taşınan ölüm ve koruma dahil. |
| Gece izin matrisi | **1.274** karakter × aşama × hamle denemesi; gerçek `authenticated` yetkisi, `anon` engeli ve özel tablo/fonksiyon erişim engelleri. |
| Yeni tam oyunlar | **84** sabit tohumlu oyun, 4–24 kişi, tek/iki vampir, büyü, dönüşüm, susturma, son ok, atış, konuşma sıraları ve bağlantı kopmalarıyla public RPC üzerinden tamamlanır. |
| Süre ve gizlilik | Ana süre, 5/10 ek süre doğrulaması, pas, eksik hamle, değiştirilebilir seçim, geçersiz/eski hedef, ayrılan oyuncu ve tekrar sorgulamada aynı gecenin iki kez çözülmemesi. |
| Zafer | Sapkın için sekiz ayrı ölüm nedeni; ölümden sonra kazanma, dönüşüm/rol değişimi sonrası kalıcı zafer; her tarafın bütün son oyun ödülleri; avcı son oku öncesi zaferin bekletilmesi. |
| Eşitlik | İki ve üç adaylı eşitlik, muhtarın ilk kararı, muhtar zaman aşımı, ikinci eşitlikte muhtarın atlanması, gece geçişi ve yeni günün açılması. |
| Dağıtım | 4–24 oyuncu, tek/iki vampir, minimum oyuncu eşikleri, Alfa’nın mevcut vampirin yerini alması, Koruma’nın dışlanması, gizli rol havuzu ve 2.048 eşit öncelikli çekiliş. |
| Geçiş ve rövanş | Gerçek V2 gecesi üzerinde geçişin iki kez uygulanması; roller, oylar ve sürenin korunması; sonraki dağıtımda yeni kurallar ve özel hak/bildirim/hedef sıfırlaması. |

Eski sıralı gece sözleşmesi testleri `tests/fixtures/setup-v2.sql` üzerinde açıkça **Archived V2 contract** olarak korunur. Bunlar yeni gecenin davranışını test etmez. Güncel kuralları `tests/v21-*.test.mjs` dosyaları sınar; taşıma testi ise eski aktif oyunu güncel SQL ile gerçekten yükseltir. Ses, istemci, oda yönetimi ve diğer bağımsız kontroller ayrıca çalışır.

```sh
npm ci
npm test
npm run build
```

Bu kontroller belirtilen durumları ve tekrarlanabilir simülasyonları kapsar; bütün olası ağ ve kullanıcı davranışları için matematiksel hatasızlık ispatı değildir. Oyuncuların bilinçli biçimde hep pas geçmesi yeni gecelerde ölümü garanti etmez; aynı oylamanın sınırsız tekrarı ve gece hamlesi beklerken süresiz takılma engellenmiştir.

'use strict';
/* api/_i18n.js: ota-onalarga yuboriladigan hamma server matnlari (bot, xabarnomalar, eslatma, davomat).
 * t(lang, kalit, {o'zgaruvchi: qiymat}) -> matn. Til topilmasa yoki kalit yo'q bo'lsa, o'zbekcha olinadi. */

const D = {
  uz: {
    choose_lang: 'Tilni tanlang / Выберите язык',
    btn_uz: "🇺🇿 O'zbekcha", btn_ru: '🇷🇺 Русский',
    lang_set: "Til o'zgartirildi: O'zbekcha ✅",
    welcome_sub: "Assalomu alaykum! Bu — 28-maktab ota-onalar boti.\n\n📢 Davom etish uchun avval maktab kanaliga obuna bo'ling: {ch}\n\nObuna bo'lgach, pastdagi «✅ Obunani tekshirish» tugmasini bosing.",
    welcome_phone: "Assalomu alaykum! Bu — 28-maktab ota-onalar boti.\n\nFarzandingiz haqidagi xatlar va saytdagi ota-onalar kabineti kodi shu yerga yuboriladi. Buning uchun pastdagi tugma orqali telefon raqamingizni ulashing (faqat bir marta).",
    btn_channel: "📢 Kanalga o'tish", btn_check: '✅ Obunani tekshirish', btn_contact: '📱 Telefon raqamimni yuborish',
    toast_sub_ok: 'Obuna tasdiqlandi ✅', toast_not_sub: "Siz hali kanalga obuna bo'lmagansiz",
    sub_ok_phone: "✅ Obuna tasdiqlandi.\n\nEndi pastdagi tugmani bosib, telefon raqamingizni ulashing (faqat bir marta).",
    ready: "✅ Tayyor! Farzandingiz haqidagi xatlar va ota-onalar kabineti kodi shu yerga yuboriladi.\n\nDavomat haqidagi xabarlarni to'xtatish: /toxtat, qayta yoqish: /yoqish. Tilni o'zgartirish: /til",
    contact_foreign: "Iltimos, o'zingizning raqamingizni ulashing (pastdagi tugma orqali).",
    linked_ok: "✅ Raqamingiz ulandi. Endi farzandingiz haqida berilgan xatlar shu yerga yuboriladi.",
    linked_sub: "✅ Raqamingiz ulandi.\n\n📢 Davom etish uchun avval maktab kanaliga obuna bo'ling: {ch}\n\nObuna bo'lgach, pastdagi «✅ Obunani tekshirish» tugmasini bosing.",
    contact_fail: "Raqamni ulab bo'lmadi. Birozdan keyin qayta urinib ko'ring.",
    need_start: 'Botni ishga tushirish uchun /start ni bosing.',
    err_temp: "⚠️ Vaqtincha texnik xatolik. Birozdan keyin qayta urinib ko'ring.",
    ack_thanks: 'Rahmat! Tanishganingiz qayd etildi ✅', ack_already: 'Siz allaqachon tanishgansiz ✅',
    ack_denied: "Ruxsat yo'q", ack_notfound: 'Xabar topilmadi',
    btn_ack: '✅ Tanishdim', btn_ack_done: '✅ Tanishdingiz',
    mute_on: "🔕 Davomat haqidagi xabarlar to'xtatildi. Qayta yoqish: /yoqish",
    mute_off: '🔔 Davomat haqidagi xabarlar yoqildi.',
    child: 'Farzandingiz', cls_sfx: '{c}-sinf', date_lb: 'Sana: ', detail_lb: 'Tafsilot: ',
    k0_head: '📩 Ogohlantirish xati haqida xabar', k0_line: '{c} uchun ogohlantirish xati berildi.', k0_reason: 'Sababi: ', k0_cap: 'Xat nusxasi (PDF)', k0_name: 'Ogohlantirish xati',
    kpraise_head: '🌟 Minnatdorchilik xati haqida xabar', kpraise_line: '{c} uchun minnatdorchilik xati berildi.', kpraise_reason: 'Sababi: ', kpraise_cap: 'Xat nusxasi (PDF)', kpraise_name: 'Minnatdorchilik xati',
    kinvite_head: "📅 Ota-onalar yig'ilishiga taklifnoma", kinvite_line: "Hurmatli ota-ona! Sizni maktabda o'tadigan ota-onalar yig'ilishiga taklif qilamiz. {c}.", kinvite_reason: 'Mavzu va vaqt: ', kinvite_cap: 'Taklifnoma nusxasi (PDF)', kinvite_name: 'Taklifnoma',
    ksummon_head: '📞 Maktabga chaqiruv xati', ksummon_line: "Hurmatli ota-ona! {c} bo'yicha sizni maktabga chaqiramiz.", ksummon_reason: 'Sabab va vaqt: ', ksummon_cap: 'Xat nusxasi (PDF)', ksummon_name: 'Chaqiruv xati',
    rem_text: "🔔 <b>Eslatma</b>\n\n{who} uchun {date} sanasida berilgan «{kind}» bilan hali tanishmadingiz.{reason}\n\nTanishib chiqqan bo'lsangiz, pastdagi tugmani bosing.{link}",
    rem_link: "\n\nXatni ko'rish va tasdiqlash: {url}",
    rem_reason: '\n{lb}{reason}',
    abs_text: "🏫 <b>28-maktab</b>\n\nHurmatli ota-ona! {who} {date} kuni darsga kelmadi.\nHolat: <b>{code}</b>\n\nAgar xatolik bo'lsa yoki sabab bo'lsa, sinf rahbari bilan bog'laning.\n\nBu xabarlarni to'xtatish: /toxtat",
    abs_late: "🏫 <b>28-maktab</b>\n\nHurmatli ota-ona! {who} {date} kuni darsga kechikdi.\n\nBu xabarlarni to'xtatish: /toxtat",
    code_Sz: 'Sababsiz', code_Kas: 'Kasal', code_Sb: 'Sababli', code_Tad: 'Tadbir', code_Kch: 'Kechikdi',
    parent_code: "🔐 <b>28-maktab</b>: ota-onalar kabineti uchun kirish kodi:\n\n<b>{code}</b>\n\nKod 5 daqiqa amal qiladi. Uni hech kimga aytmang. Agar bu so'rovni siz yubormagan bo'lsangiz, e'tibor bermang.",
  },
  ru: {
    choose_lang: 'Tilni tanlang / Выберите язык',
    btn_uz: "🇺🇿 O'zbekcha", btn_ru: '🇷🇺 Русский',
    lang_set: 'Язык изменён: Русский ✅',
    welcome_sub: 'Здравствуйте! Это бот для родителей школы №28.\n\n📢 Чтобы продолжить, сначала подпишитесь на канал школы: {ch}\n\nПосле подписки нажмите кнопку «✅ Проверить подписку» ниже.',
    welcome_phone: 'Здравствуйте! Это бот для родителей школы №28.\n\nСюда приходят письма о вашем ребёнке и код для входа в кабинет родителей на сайте. Для этого поделитесь номером телефона с помощью кнопки ниже (один раз).',
    btn_channel: '📢 Перейти на канал', btn_check: '✅ Проверить подписку', btn_contact: '📱 Отправить мой номер телефона',
    toast_sub_ok: 'Подписка подтверждена ✅', toast_not_sub: 'Вы ещё не подписались на канал',
    sub_ok_phone: '✅ Подписка подтверждена.\n\nТеперь нажмите кнопку ниже и поделитесь номером телефона (один раз).',
    ready: '✅ Готово! Письма о вашем ребёнке и код для кабинета родителей будут приходить сюда.\n\nОстановить сообщения о посещаемости: /toxtat, включить снова: /yoqish. Сменить язык: /til',
    contact_foreign: 'Пожалуйста, поделитесь своим номером (кнопкой ниже).',
    linked_ok: '✅ Ваш номер подключён. Теперь письма о вашем ребёнке будут приходить сюда.',
    linked_sub: '✅ Ваш номер подключён.\n\n📢 Чтобы продолжить, сначала подпишитесь на канал школы: {ch}\n\nПосле подписки нажмите кнопку «✅ Проверить подписку» ниже.',
    contact_fail: 'Не удалось подключить номер. Попробуйте позже.',
    need_start: 'Нажмите /start, чтобы запустить бота.',
    err_temp: '⚠️ Временная техническая ошибка. Попробуйте позже.',
    ack_thanks: 'Спасибо! Ваше ознакомление отмечено ✅', ack_already: 'Вы уже ознакомились ✅',
    ack_denied: 'Нет доступа', ack_notfound: 'Сообщение не найдено',
    btn_ack: '✅ Ознакомился', btn_ack_done: '✅ Вы ознакомились',
    mute_on: '🔕 Сообщения о посещаемости остановлены. Включить снова: /yoqish',
    mute_off: '🔔 Сообщения о посещаемости включены.',
    child: 'Ваш ребёнок', cls_sfx: '{c} класс', date_lb: 'Дата: ', detail_lb: 'Подробнее: ',
    k0_head: '📩 Уведомление о предупредительном письме', k0_line: 'Для {c} выдано предупредительное письмо.', k0_reason: 'Причина: ', k0_cap: 'Копия письма (PDF)', k0_name: 'Предупредительное письмо',
    kpraise_head: '🌟 Уведомление о благодарственном письме', kpraise_line: 'Для {c} выдано благодарственное письмо.', kpraise_reason: 'Причина: ', kpraise_cap: 'Копия письма (PDF)', kpraise_name: 'Благодарственное письмо',
    kinvite_head: '📅 Приглашение на родительское собрание', kinvite_line: 'Уважаемые родители! Приглашаем вас на родительское собрание в школе. {c}.', kinvite_reason: 'Тема и время: ', kinvite_cap: 'Копия приглашения (PDF)', kinvite_name: 'Приглашение',
    ksummon_head: '📞 Письмо-вызов в школу', ksummon_line: 'Уважаемые родители! Приглашаем вас в школу по вопросу: {c}.', ksummon_reason: 'Причина и время: ', ksummon_cap: 'Копия письма (PDF)', ksummon_name: 'Письмо-вызов',
    rem_text: '🔔 <b>Напоминание</b>\n\nВы ещё не ознакомились с письмом «{kind}» для {who}, выданным {date}.{reason}\n\nЕсли вы уже ознакомились, нажмите кнопку ниже.{link}',
    rem_link: '\n\nПосмотреть письмо и подтвердить: {url}',
    rem_reason: '\n{lb}{reason}',
    abs_text: '🏫 <b>Школа №28</b>\n\nУважаемые родители! {who} {date} не пришёл(ла) на уроки.\nСтатус: <b>{code}</b>\n\nЕсли это ошибка или есть причина, свяжитесь с классным руководителем.\n\nОстановить эти сообщения: /toxtat',
    abs_late: '🏫 <b>Школа №28</b>\n\nУважаемые родители! {who} {date} опоздал(а) на уроки.\n\nОстановить эти сообщения: /toxtat',
    code_Sz: 'Без уважительной причины', code_Kas: 'Болезнь', code_Sb: 'По уважительной причине', code_Tad: 'Мероприятие', code_Kch: 'Опоздание',
    parent_code: '🔐 <b>Школа №28</b>: код для входа в кабинет родителей:\n\n<b>{code}</b>\n\nКод действует 5 минут. Никому его не сообщайте. Если вы не запрашивали код, просто проигнорируйте это сообщение.',
  },
};

function normLang(l) { return l === 'ru' ? 'ru' : 'uz'; }
function t(lang, key, vars) {
  const L = D[normLang(lang)];
  let s = (L && L[key] != null) ? L[key] : (D.uz[key] != null ? D.uz[key] : key);
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
}
function kindKey(kind) { return kind === 'praise' || kind === 'invite' || kind === 'summon' ? 'k' + kind : 'k0'; }

module.exports = { t, normLang, kindKey, D };

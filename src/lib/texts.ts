/**
 * Every word the shop says, in one file. Change `LANG` to switch the whole
 * shop, or edit the strings — nothing else in the code holds UI text.
 * Product names and descriptions come from your rikma, as you wrote them.
 */

const he = {
  dir: 'rtl',
  shopTitle: 'החנות',
  allProducts: 'כל המוצרים',
  search: 'חיפוש',
  searchPlaceholder: 'מה מחפשים?',
  filterBy: 'סינון',
  clear: 'ניקוי',
  empty: 'אין כאן מוצרים עדיין.',
  emptyFiltered: 'אין מוצרים שמתאימים לסינון.',
  from: 'החל מ־',
  soldOut: 'אזל',
  lowStock: 'נותרו {{count}}',
  inStock: 'במלאי',
  hasOptions: 'כמה אפשרויות',
  prev: 'הקודם',
  next: 'הבא',
  backToShop: 'חזרה לחנות',
  quantity: 'כמות',
  addToCart: 'הוספה לעגלה',
  added: 'נוסף לעגלה',
  chooseOptions: 'בחרו {{names}}',
  notInShop: 'המוצר הזה נמכר בהצעת מחיר',
  byQuote: 'בהצעת מחיר',
  requestQuote: 'לבקשת הצעה',
  unit: 'ליחידה: {{unit}}',
  leadTime: 'זמן הכנה: {{days}} ימים',
  delivery: 'אספקה',
  deliveryKinds: {
    pickup: 'איסוף עצמי',
    delivery: 'משלוח',
    digital: 'דיגיטלי',
    contact: 'בתיאום איתכם'
  } as Record<string, string>,
  free: 'חינם',
  // Shipping — priced by the rikma's zones in 1lev1
  shipAddress: 'לאן לשלוח',
  shipCountry: 'מדינה',
  shipCity: 'יישוב',
  shipStreet: 'רחוב',
  shipHouse: 'מספר בית',
  shipApartment: 'דירה',
  shipFloor: 'קומה',
  shipEntrance: 'כניסה',
  shipZip: 'מיקוד',
  shipNotes: 'הערות לשליח',
  shipNotesPlaceholder: 'קוד כניסה, איפה להשאיר…',
  shipNeedsAddress: 'הזינו יישוב כדי לראות את אפשרויות המשלוח ומחירן.',
  shipOutside: 'אנחנו עוד לא שולחים לכתובת הזו — אפשר לבחור איסוף, או שנתאם איתכם.',
  shipQuoting: 'מחשבים משלוח…',
  shipMissing: 'חסרים פרטים בכתובת: {{fields}}',
  shipFreeIn: 'עוד {{amount}} למשלוח חינם',
  shipFreeOver: 'משלוח חינם בהזמנה מעל {{amount}}',
  shipEtaRange: '{{min}}–{{max}} ימי עסקים',
  shipEtaDays: '{{days}} ימי עסקים',
  shipDispatch: 'יוצא ב{{date}}',
  shipPickupAt: 'איסוף: {{name}}',
  shipPickupHere: 'אפשר גם לאסוף',
  shipZone: 'אזור: {{name}}',
  shipChangedFee: 'מחיר המשלוח השתנה מאז שבדקתם — עדכנו לכם את העגלה.',
  cart: 'עגלה',
  cartEmpty: 'העגלה ריקה.',
  remove: 'הסרה',
  subtotal: 'סכום ביניים',
  deliveryFee: 'משלוח',
  total: 'סה״כ לתשלום',
  note: 'הערה להזמנה',
  notePlaceholder: 'משהו שחשוב שנדע?',
  pay: 'למעבר לתשלום',
  paying: 'מעבירים לתשלום…',
  checkoutFailed: 'לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד רגע.',
  // Order now, pay by arrangement (ARRANGED_PAYMENT)
  payArranged: 'הזמנה ותשלום בתיאום',
  arrangedIntro: 'לא תחויבו עכשיו. נחזור אליכם לתיאום התשלום — בביט, בהעברה או במזומן.',
  arrangedName: 'שם',
  arrangedPhone: 'טלפון',
  arrangedEmail: 'אימייל (לא חובה)',
  arrangedCity: 'עיר',
  arrangedStreet: 'רחוב ומספר',
  arrangedSubmit: 'שליחת ההזמנה',
  arrangedSending: 'שולחים…',
  arrangedInvalid: 'בדקו את השדות המסומנים.',
  arrangedTooMany: 'נשלחו מכאן יותר מדי הזמנות. נסו שוב בעוד כמה דקות.',
  arrangedFailed: 'לא הצלחנו לשלוח את ההזמנה. נסו שוב בעוד רגע.',
  arrangedThanks: 'לא חויבתם. ניצור איתכם קשר בהקדם כדי לתאם את התשלום.',
  arrangedWhatsapp: 'לכתוב לנו בוואטסאפ',
  arrangedWhatsappText: 'שלום, לגבי הזמנה {{number}}',
  noPayment: 'החנות עוד לא מקבלת הזמנות באתר — צרו איתנו קשר.',
  payWith: {
    stripe: 'תשלום בכרטיס אשראי',
    paypal: 'תשלום ב־PayPal'
  } as Record<string, string>,
  paymentFailed: 'התשלום לא הושלם ולא חויבתם. העגלה שלכם עדיין שמורה — נסו שוב.',
  shippingRefused: 'אנחנו לא שולחים לכתובת שנבחרה ב־PayPal, ולא חויבתם. בחרו כתובת אחרת או אפשרות אספקה אחרת.',
  cartChanged: 'העגלה עודכנה לפי המלאי והמחירים העדכניים — בדקו לפני התשלום.',
  problems: {
    gone: 'מוצר שהיה בעגלה כבר לא זמין, והוסר.',
    notForSale: '"{{name}}" לא נמכר בקופה — הוסר מהעגלה.',
    soldOut: '"{{name}}" אזל מהמלאי, והוסר.',
    adjusted: 'הכמות של "{{name}}" עודכנה ל־{{count}}.',
    currency: '"{{name}}" מתומחר במטבע אחר — אפשר לקנות אותו בהזמנה נפרדת.',
    tooManyLines: 'יש יותר מדי שורות בעגלה — חלק נשאר בחוץ.'
  } as Record<string, string>,
  orderTitle: 'ההזמנה התקבלה',
  orderNumber: 'מספר הזמנה: {{number}}',
  orderRecording: 'התשלום עבר. אנחנו רושמים את ההזמנה — זה לוקח כמה שניות.',
  orderUnpaid: 'התשלום לא הושלם. העגלה שלכם עדיין שמורה.',
  orderPending: 'התשלום בבדיקה אצל ספק התשלום. ההזמנה תירשם כשיאושר.',
  orderUnknown: 'לא מצאנו את ההזמנה הזו.',
  backToCart: 'חזרה לעגלה',
  orderStatus: {
    pendingPayment: 'התקבלה — ממתינה לתיאום התשלום',
    paid: 'התקבלה — מכינים אותה',
    shipped: 'נשלחה',
    fulfilled: 'נמסרה',
    cancelled: 'בוטלה'
  } as Record<string, string>,
  orderLines: 'מה הוזמן',
  poweredBy: 'החנות פועלת על 1lev1'
};

type Texts = typeof he;

const en: Texts = {
  dir: 'ltr',
  shopTitle: 'Shop',
  allProducts: 'All products',
  search: 'Search',
  searchPlaceholder: 'What are you looking for?',
  filterBy: 'Filter',
  clear: 'Clear',
  empty: 'No products here yet.',
  emptyFiltered: 'No products match these filters.',
  from: 'From ',
  soldOut: 'Sold out',
  lowStock: '{{count}} left',
  inStock: 'In stock',
  hasOptions: 'More options',
  prev: 'Previous',
  next: 'Next',
  backToShop: 'Back to the shop',
  quantity: 'Quantity',
  addToCart: 'Add to cart',
  added: 'Added to cart',
  chooseOptions: 'Choose {{names}}',
  notInShop: 'This product is sold by quote',
  byQuote: 'By quote',
  requestQuote: 'Request a quote',
  unit: 'Per {{unit}}',
  leadTime: 'Ready in {{days}} days',
  delivery: 'Delivery',
  deliveryKinds: {
    pickup: 'Pickup',
    delivery: 'Shipping',
    digital: 'Digital',
    contact: "We'll arrange it with you"
  },
  free: 'Free',
  shipAddress: 'Where to send it',
  shipCountry: 'Country',
  shipCity: 'City',
  shipStreet: 'Street',
  shipHouse: 'Number',
  shipApartment: 'Apt',
  shipFloor: 'Floor',
  shipEntrance: 'Entrance',
  shipZip: 'Postal code',
  shipNotes: 'Notes for the courier',
  shipNotesPlaceholder: 'Door code, where to leave it…',
  shipNeedsAddress: 'Enter a city to see the delivery options and their price.',
  shipOutside: 'We do not deliver to this address yet — you can pick up, or we will be in touch.',
  shipQuoting: 'Pricing delivery…',
  shipMissing: 'The address is missing: {{fields}}',
  shipFreeIn: '{{amount}} more for free delivery',
  shipFreeOver: 'Free delivery on orders over {{amount}}',
  shipEtaRange: '{{min}}–{{max}} business days',
  shipEtaDays: '{{days}} business days',
  shipDispatch: 'Goes out {{date}}',
  shipPickupAt: 'Pickup: {{name}}',
  shipPickupHere: 'Pickup is also possible',
  shipZone: 'Zone: {{name}}',
  shipChangedFee: 'The delivery price changed since you looked — your cart is updated.',
  cart: 'Cart',
  cartEmpty: 'Your cart is empty.',
  remove: 'Remove',
  subtotal: 'Subtotal',
  deliveryFee: 'Shipping',
  total: 'Total',
  note: 'Order note',
  notePlaceholder: 'Anything we should know?',
  pay: 'Continue to payment',
  paying: 'Opening the payment page…',
  checkoutFailed: 'The payment page could not be opened. Please try again in a moment.',
  // Order now, pay by arrangement (ARRANGED_PAYMENT)
  payArranged: 'Order now, arrange payment',
  arrangedIntro: "You won't be charged now. We'll get back to you to arrange the payment — by transfer, cash or another way.",
  arrangedName: 'Name',
  arrangedPhone: 'Phone',
  arrangedEmail: 'Email (optional)',
  arrangedCity: 'City',
  arrangedStreet: 'Street and number',
  arrangedSubmit: 'Send the order',
  arrangedSending: 'Sending…',
  arrangedInvalid: 'Please check the highlighted fields.',
  arrangedTooMany: 'Too many orders were sent from here. Please try again in a few minutes.',
  arrangedFailed: "The order couldn't be sent. Please try again in a moment.",
  arrangedThanks: "You haven't been charged. We'll be in touch soon to arrange the payment.",
  arrangedWhatsapp: 'Message us on WhatsApp',
  arrangedWhatsappText: 'Hi, about order {{number}}',
  noPayment: "The shop isn't taking orders on the site yet — please get in touch.",
  payWith: {
    stripe: 'Pay by card',
    paypal: 'Pay with PayPal'
  } as Record<string, string>,
  paymentFailed: 'The payment was not completed and you were not charged. Your cart is still saved — please try again.',
  shippingRefused: 'We do not ship to the address chosen in PayPal, and you were not charged. Pick another address or delivery option.',
  cartChanged: 'Your cart was updated to current stock and prices — please review it.',
  problems: {
    gone: 'An item in your cart is no longer available and was removed.',
    notForSale: '"{{name}}" cannot be bought here and was removed.',
    soldOut: '"{{name}}" is sold out and was removed.',
    adjusted: 'The quantity of "{{name}}" was changed to {{count}}.',
    currency: '"{{name}}" is priced in another currency — order it separately.',
    tooManyLines: 'Your cart has too many lines — some were left out.'
  },
  orderTitle: 'Order received',
  orderNumber: 'Order number: {{number}}',
  orderRecording: 'Your payment went through. We are recording the order — this takes a few seconds.',
  orderUnpaid: 'The payment was not completed. Your cart is still saved.',
  orderPending: 'Your payment is being reviewed by the payment provider. The order is recorded once it clears.',
  orderUnknown: 'We could not find this order.',
  backToCart: 'Back to cart',
  orderStatus: {
    pendingPayment: 'Received — awaiting payment arrangement',
    paid: 'Received — being prepared',
    shipped: 'Shipped',
    fulfilled: 'Delivered',
    cancelled: 'Cancelled'
  },
  orderLines: 'What you ordered',
  poweredBy: 'Powered by 1lev1'
};

const ALL = { he, en } as const;

/** The shop's language. */
export const LANG: keyof typeof ALL = 'he';

export const t: Texts = ALL[LANG];

/** `fill('נותרו {{count}}', { count: 3 })` ⇒ `נותרו 3`. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

export function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return '';
  if (!currency) return String(amount);
  try {
    return new Intl.NumberFormat(LANG === 'he' ? 'he-IL' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

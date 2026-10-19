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

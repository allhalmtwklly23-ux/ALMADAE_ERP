export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  colors: { name: string; hex: string }[];
  sizes: string[];
  fabric: string;
  fit: string;
  description: string;
  badge?: string;
};

export const products: Product[] = [
  { id: "thobe-white", name: "ثوب المدار الكلاسيكي", category: "أبيض", price: 349, image: "https://images.pexels.com/photos/7129607/pexels-photo-7129607.jpeg?auto=compress&cs=tinysrgb&w=1000", colors: [{ name: "أبيض ناصع", hex: "#f7f7f4" }, { name: "أبيض لؤلؤي", hex: "#d9dde2" }], sizes: ["48", "50", "52", "54", "56", "58", "60", "62"], fabric: "يُحدد عند اعتماد خامة المنتج", fit: "قصة كلاسيكية", description: "ثوب سعودي بتصميم كلاسيكي وحضور هادئ. تُستكمل تفاصيل القماش والتفصيل بعد اعتماد مواصفات المنتج.", badge: "الأكثر اختيارًا" },
  { id: "thobe-sand", name: "ثوب المدار اليومي", category: "ألوان", price: 329, image: "https://images.pexels.com/photos/33853481/pexels-photo-33853481.jpeg?auto=compress&cs=tinysrgb&w=1000", colors: [{ name: "رملي", hex: "#d7d0c5" }, { name: "رمادي", hex: "#888b8a" }, { name: "كحلي", hex: "#172439" }], sizes: ["48", "50", "52", "54", "56", "58", "60", "62"], fabric: "يُحدد عند اعتماد خامة المنتج", fit: "قصة يومية", description: "ثوب سعودي يومي بخطوط نظيفة. تُعتمد خيارات الألوان والخامة النهائية قبل استقبال الطلبات." },
  { id: "thobe-formal", name: "ثوب المدار الرسمي", category: "رسمي", price: 389, image: "https://images.pexels.com/photos/34171661/pexels-photo-34171661.jpeg?auto=compress&cs=tinysrgb&w=1000", colors: [{ name: "أبيض", hex: "#f7f7f4" }, { name: "كحلي", hex: "#172439" }], sizes: ["48", "50", "52", "54", "56", "58", "60", "62"], fabric: "يُحدد عند اعتماد خامة المنتج", fit: "قصة رسمية", description: "ثوب سعودي للمناسبات والاجتماعات بتصميم متوازن. تُضاف مواصفات القماش والتفاصيل بعد اعتمادها.", badge: "إصدار جديد" },
  { id: "thobe-midnight", name: "ثوب المدار المسائي", category: "ألوان", price: 369, image: "https://images.pexels.com/photos/33853473/pexels-photo-33853473.jpeg?auto=compress&cs=tinysrgb&w=1000", colors: [{ name: "كحلي", hex: "#172439" }, { name: "رمادي فحمي", hex: "#555d68" }], sizes: ["48", "50", "52", "54", "56", "58", "60", "62"], fabric: "يُحدد عند اعتماد خامة المنتج", fit: "قصة مستقيمة", description: "ثوب سعودي بلون عميق وتصميم هادئ. تفاصيل القماش والتفصيل قيد اعتماد العلامة." },
];

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(price) + " ر.س";

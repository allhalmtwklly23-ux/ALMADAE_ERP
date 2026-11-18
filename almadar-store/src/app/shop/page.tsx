import { ShopCatalog } from "@/components/shop-catalog";

export const metadata = { title: "تسوق الثياب | المدار" };

export default function ShopPage() {
  return <><section className="page-intro"><div className="page-intro-inner"><span className="eyebrow">مجموعة المدار</span><h1>الثياب</h1><p>اكتشف تصاميم المدار واختر ما يعبّر عن حضورك. تفاصيل المقاس والألوان تتضح عند اختيار المنتج.</p></div></section><section className="section"><ShopCatalog /></section></>;
}

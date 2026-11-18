import { AuthPanel } from "@/components/auth-panel";

export const metadata = { title: "حسابي | المدار" };

export default function AccountPage() {
  return <><section className="page-intro"><div className="page-intro-inner"><span className="eyebrow">المدار</span><h1>حسابي</h1><p>بياناتك وطلباتك في مكان واحد.</p></div></section><section className="section account-section"><AuthPanel /></section></>;
}

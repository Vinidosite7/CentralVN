import RegisterSW from "../components/RegisterSW";

export const metadata = {
  title: "Central Financeira",
  description: "Contas, cartões, vendas e saldo — feito pro seu jeito.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Central" },
};
export const viewport = {
  themeColor: "#070812",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icon-180.png" />
      </head>
      <body style={{ margin: 0, background: "#070812" }}>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}

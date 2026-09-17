import { Attacks } from "./Attacks";
import { Cta } from "./Cta";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { Nav } from "./Nav";
import { Regression } from "./Regression";
import { Worlds } from "./Worlds";

export function LandingPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <Attacks />
        <Worlds />
        <Regression />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

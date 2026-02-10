import React from "react";

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "Workflow", href: "#workflow" },
  { name: "FAQ", href: "#faq" },
  { name: "Docs", href: "#docs" },
];

const features = [
  {
    title: "2-Click Capture",
    description: "The fastest way to take screenshots. No more digging through menus.",
    icon: "⚡",
  },
  {
    title: "Instant Copy",
    description: "Copy directly to clipboard. Skip the download and keep your storage clean.",
    icon: "📋",
  },
  {
    title: "Area Selection",
    description: "Precisely drag and capture exactly what you need with our pixel-perfect crop tool.",
    icon: "🎯",
  },
  {
    title: "Full Page Mode",
    description: "Capture entire scrolling pages in one high-resolution image automatically.",
    icon: "📜",
  },
  {
    title: "Extended Capture",
    description: "Need more than what's on screen? Our extended mode scrolls and captures for you.",
    icon: "↔️",
  },
  {
    title: "Keyboard First",
    description: "Power users love our shortcuts. Ctrl+Shift+S and you're done.",
    icon: "⌨️",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Trigger Instant Tab",
    description: "Click the icon or use Cmd/Ctrl + Shift + S to start the capture process instantly.",
    image: "/assets/preview-example.png",
  },
  {
    step: "02",
    title: "Select Your Mode",
    description: "Choose between Visible Area, Selected Region, or Full Page capture depending on your needs.",
    image: "/assets/extended-example.png",
  },
  {
    step: "03",
    title: "Copy or Save",
    description: "The preview pops up immediately. Click copy to share instantly or download for later.",
    image: "/assets/preview-example.png",
  },
];

const faqs = [
  {
    question: "Is it free to use?",
    answer: "Yes! Instant Tab Screenshot is completely free for all users.",
  },
  {
    question: "Does it work on all websites?",
    answer: "It works on 99% of websites. Some restricted browser pages (like the Chrome Web Store or internal settings) might limit extension functionality.",
  },
  {
    question: "Where are my screenshots saved?",
    answer: "If you choose to download, they go directly to your browser's default download folder. If you copy, they stay in your clipboard.",
  },
];

function Navbar() {
  return (
    <nav className="navbar glass">
      <a href="#" className="logo">
        <img src="/assets/store-icon.png" alt="Logo" />
        <span className="logo-text">Instant Tab</span>
      </a>
      <div className="nav-links">
        {navLinks.map((link) => (
          <a key={link.name} href={link.href}>
            {link.name}
          </a>
        ))}
      </div>
      <a href="#download" className="btn btn-primary">
        Get Extension
      </a>
    </nav>
  );
}

function Hero() {
  return (
    <section className="hero container">
      <span className="eyebrow">A minimalist capture experience</span>
      <h1>Capture the web, with a touch of calm.</h1>
      <p>
        Instant Tab Screenshot is built for those who value speed and aesthetics.
        A two-click workflow that fits perfectly into your high-volume capture routine.
      </p>
      <div className="hero-actions">
        <a href="#download" className="btn btn-primary">Add to Chrome</a>
        <a href="#workflow" className="btn btn-outline">See how it works</a>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="section-padding container">
      <div className="section-header">
        <h2 className="text-gradient">Power tools for efficiency</h2>
        <p>Everything you need to capture and share content faster than ever before.</p>
      </div>
      <div className="features-grid">
        {features.map((feature) => (
          <div key={feature.title} className="feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section id="workflow" className="section-padding container">
      <div className="section-header">
        <h2 className="text-gradient">Simple, reliable workflow</h2>
        <p>Three steps to a perfect capture every single time.</p>
      </div>
      <div className="workflow-wrap">
        {workflowSteps.map((step) => (
          <div key={step.step} className="workflow-step">
            <div className="workflow-content">
              <span className="step-number">{step.step}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
            <div className="workflow-image">
              <img src={step.image} alt={step.title} loading="lazy" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="section-padding container">
      <div className="section-header">
        <h2 className="text-gradient">Frequently Asked Questions</h2>
        <p>Quick answers to common questions about Instant Tab Screenshot.</p>
      </div>
      <div className="features-grid" style={{ gridTemplateColumns: "1fr" }}>
        {faqs.map((faq) => (
          <div key={faq.question} className="feature-card" style={{ padding: "1.5rem 2.5rem" }}>
            <h3>{faq.question}</h3>
            <p>{faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#" className="logo">
              <img src="/assets/store-icon.png" alt="Logo" />
              <span className="logo-text">Instant Tab</span>
            </a>
            <p>Built for professionals who need speed and reliability in their screenshot workflow.</p>
          </div>
          <div className="footer-column">
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#workflow">Workflow</a></li>
              <li><a href="#docs">Documentation</a></li>
            </ul>
          </div>
          <div className="footer-column">
            <h4>Resources</h4>
            <ul>
              <li><a href="#">Support</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
          <div className="footer-column">
            <h4>Connect</h4>
            <ul>
              <li><a href="#">Twitter</a></li>
              <li><a href="#">GitHub</a></li>
              <li><a href="#">Chrome Store</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Instant Tab Screenshot. All rights reserved.</p>
          <p>Made with ❤️ for the web.</p>
        </div>
      </div>
    </footer>
  );
}

function App() {
  return (
    <div className="page-wrapper">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Workflow />
        <FAQ />
        <section className="container section-padding">
          <div className="cta-banner">
            <h2 className="text-gradient">Ready to supercharge your workflow?</h2>
            <p>Join thousands of users who capture the web with Instant Tab Screenshot.</p>
            <a href="#download" className="btn btn-primary" style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}>
              Add to Chrome — It's Free
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default App;

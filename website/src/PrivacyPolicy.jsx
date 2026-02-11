import React, { useEffect } from "react";

function PrivacyPolicy() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="policy-page section-padding container">
            <div className="policy-content glass">
                <h1 className="text-gradient">Privacy Policy</h1>
                <p className="last-updated">Last Updated: February 11, 2026</p>

                <section>
                    <h2>Introduction</h2>
                    <p>
                        Instant Tab Screenshot ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
                        explains how we handle information when you use our Chrome Extension and Website.
                    </p>
                </section>

                <section>
                    <h2>Data Collection</h2>
                    <p>
                        <strong>Personal Information:</strong> We do NOT collect any personally identifiable information (PII) such
                        as your name, email address, or phone number.
                    </p>
                    <p>
                        <strong>Usage Data:</strong> We do NOT track your browsing history or monitor your online activities.
                    </p>
                    <p>
                        <strong>Screenshot Data:</strong> All screenshots taken using our extension are processed locally on your
                        device. We do NOT upload your screenshots to any external servers. If you choose to copy a screenshot to
                        your clipboard or download it, that data remains entirely under your control.
                    </p>
                </section>

                <section>
                    <h2>Permissions</h2>
                    <p>
                        Our extension requires certain permissions to function corectly:
                    </p>
                    <ul>
                        <li><strong>activeTab:</strong> To capture the content of the tab you are currently viewing.</li>
                        <li><strong>tabCapture / desktopCapture:</strong> To facilitate the screenshot process.</li>
                        <li><strong>clipboardWrite:</strong> To allow you to copy screenshots directly to your clipboard.</li>
                        <li><strong>storage:</strong> To save your preferred settings (like capture mode or file format) locally.</li>
                    </ul>
                </section>

                <section>
                    <h2>Third-Party Services</h2>
                    <p>
                        We do not sell, trade, or otherwise transfer your information to outside parties. Our extension does not
                        include any third-party tracking or analytics scripts.
                    </p>
                </section>

                <section>
                    <h2>Security</h2>
                    <p>
                        We prioritize the security of your data. Since all processing happens locally on your machine, your data is
                        protected by your own system's security measures.
                    </p>
                </section>

                <section>
                    <h2>Changes to This Policy</h2>
                    <p>
                        We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
                        Privacy Policy on this page.
                    </p>
                </section>

                <section>
                    <h2>Contact Us</h2>
                    <p>
                        If you have any questions about this Privacy Policy, please contact us at:
                        <a href="mailto:shivachandra9490@gmail.com" className="link">shivachandra9490@gmail.com</a>
                    </p>
                </section>

                <div style={{ marginTop: '3rem' }}>
                    <a href="/" className="btn btn-outline small">Back to Home</a>
                </div>
            </div>
        </div>
    );
}

export default PrivacyPolicy;

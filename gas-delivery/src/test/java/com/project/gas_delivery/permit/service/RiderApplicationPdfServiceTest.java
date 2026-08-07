package com.project.gas_delivery.permit.service;

import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Smoke tests for the rider certificate PDF service. The certificate is
 * a single A4 portrait page that includes only the official fields
 * required by the brief (certificate title, certificate number, rider
 * name, rider ID, assigned seller, approval / expiry dates, status,
 * QR / verification code, signature, seal, footer). These tests
 * verify both the single-page guarantee and the required-field
 * presence.
 */
class RiderApplicationPdfServiceTest {

    private final RiderApplicationPdfService service = new RiderApplicationPdfService();

    @Test
    void issuedCertificateRendersProvidedData() throws Exception {
        RiderApplicationPdfService.IssuedRiderCertificateData data =
                new RiderApplicationPdfService.IssuedRiderCertificateData(
                        "RDR-000042",
                        "RIDER-000011",
                        "Hassan Rider",
                        "hassan",
                        "rider@example.com",
                        "+255700000004",
                        "Dar es Salaam",
                        "Kariakoo",
                        "motorcycle",
                        "T 100 ABC",
                        "Honda CG125",
                        "TZ-RD-001",
                        "Admin Smith",
                        Instant.parse("2026-08-01T10:15:00Z"),
                        LocalDate.parse("2026-08-01"),
                        LocalDate.parse("2027-08-01"),
                        "QuickGas Distributors Ltd"
                );

        byte[] pdf = service.renderIssuedCertificate(data);
        assertTrue(pdf.length > 1024, "Rider certificate should be a non-trivial PDF (>1KB)");
        assertStartsWith(pdf, "%PDF-");

        // Single-page guarantee — the whole brief fits on exactly one A4
        // portrait page regardless of rider name length.
        assertPageCount(pdf, 1);

        String text = extractText(pdf);
        assertTrue(text.contains("GAS DELIVERY RIDER CERTIFICATE"),
                "Title missing");
        assertTrue(text.contains("RDR-000042"), "Certificate number missing");
        assertTrue(text.contains("RIDER-000011"), "Rider ID missing");
        assertTrue(text.contains("Hassan Rider"), "Rider name missing");
        assertTrue(text.contains("QuickGas Distributors Ltd"),
                "Assigned seller missing");
        assertTrue(text.contains("2026-08-01"), "Approval date missing");
        assertTrue(text.contains("2027-08-01"), "Expiry date missing");
        assertTrue(text.contains("VALID"),
                "Certificate status (VALID) missing");
        assertTrue(text.contains("Scan to Verify"),
                "QR verification label missing");
        assertTrue(text.contains("OFFICIAL"),
                "Official seal missing");
        assertTrue(text.contains("Authorised Signature"),
                "Signature line missing");
        assertTrue(text.contains("Admin Smith"),
                "Reviewer (signing officer) name missing");
        assertTrue(text.contains(
                "This certificate authorizes the holder to operate as a "
                        + "Gas Delivery Rider within the system."),
                "Footer legal note missing");
    }

    @Test
    void certificateIsValidPdf() throws Exception {
        RiderApplicationPdfService.IssuedRiderCertificateData data =
                new RiderApplicationPdfService.IssuedRiderCertificateData(
                        "RDR-000001",
                        "RIDER-000001",
                        "Test Rider",
                        "tester",
                        "tester@example.com",
                        "+10000000000",
                        "Region",
                        "District",
                        "motorcycle",
                        "PLATE",
                        "Model",
                        "LIC",
                        "Admin",
                        Instant.now(),
                        LocalDate.now(),
                        LocalDate.now().plusYears(1),
                        "Test Seller Co"
                );
        byte[] pdf = service.renderIssuedCertificate(data);
        assertTrue(pdf.length > 1024);
        assertStartsWith(pdf, "%PDF-");
        // Single-page guarantee even with a generic payload.
        assertPageCount(pdf, 1);
    }

    @Test
    void longRiderAndSellerNamesStillFitOnOnePage() throws Exception {
        // Stress test: very long rider + seller names must NOT push the
        // certificate onto a second page.
        RiderApplicationPdfService.IssuedRiderCertificateData data =
                new RiderApplicationPdfService.IssuedRiderCertificateData(
                        "RDR-000999",
                        "RIDER-000123",
                        "Mohammed Abdallah Al-Maktoum bin Sultan Al-Qasimi "
                                + "Al-Hashimi Al-Maktoum",
                        "longname",
                        "long.name@example.com",
                        "+255712345678",
                        "Long Region Name With Many Words",
                        "Long District Name",
                        "motorcycle",
                        "T 999 ZZZ",
                        "Honda CG125",
                        "TZ-RD-LONG",
                        "Very Senior Administrator Officer Smith-Jones",
                        Instant.now(),
                        LocalDate.now(),
                        LocalDate.now().plusYears(1),
                        "Acme Liquefied Petroleum Gas Distribution Company Limited"
                );
        byte[] pdf = service.renderIssuedCertificate(data);
        assertPageCount(pdf, 1);
        String text = extractText(pdf);
        assertTrue(text.contains("RDR-000999"), "Certificate number missing");
    }

    private static void assertPageCount(byte[] pdf, int expected) throws Exception {
        try (PdfReader reader = new PdfReader(pdf)) {
            int actual = reader.getNumberOfPages();
            assertTrue(actual == expected,
                    "Expected " + expected + " page(s) but got " + actual
                            + " — rider certificate must fit on exactly one page.");
        }
    }

    @Test
    void blankFormContainsEverySection() throws Exception {
        byte[] pdf = service.renderBlankRiderApplicationForm();
        assertTrue(pdf.length > 1024, "Blank form should be a non-trivial PDF (>1KB)");
        assertStartsWith(pdf, "%PDF-");

        String text = extractText(pdf);
        assertTrue(text.contains("Gas Delivery Rider Application Form"),
                "Title missing from blank form");
        assertTrue(text.contains("Applicant Details"), "Applicant section missing");
        assertTrue(text.contains("Full Name"), "Full name field missing");
        assertTrue(text.contains("Date of Birth"), "DOB field missing");
        assertTrue(text.contains("Gender"), "Gender field missing");
        assertTrue(text.contains("Phone Number"), "Phone field missing");
        assertTrue(text.contains("Email Address"), "Email field missing");
        assertTrue(text.contains("Residential Address"), "Address field missing");
        assertTrue(text.contains("Vehicle Details"), "Vehicle section missing");
        assertTrue(text.contains("Vehicle Type"), "Vehicle type field missing");
        assertTrue(text.contains("Vehicle Plate Number"), "Vehicle plate field missing");
        assertTrue(text.contains("Vehicle Model"), "Vehicle model field missing");
        assertTrue(text.contains("Driving Licence Number"), "Driving licence field missing");
        assertTrue(text.contains("Vehicle Registration Number"),
                "Vehicle registration field missing");
        assertTrue(text.contains("Years of Riding Experience"),
                "Years of experience field missing");
        assertTrue(text.contains("Documents Required"), "Documents section missing");
        assertTrue(text.contains("Completed Signed Application Form"),
                "Completed application form entry missing");
        assertTrue(text.contains("National ID Copy"), "National ID entry missing");
        assertTrue(text.contains("Driving Licence Copy"), "Driving licence entry missing");
        assertTrue(text.contains("Passport Size Photo"), "Passport photo entry missing");
        assertTrue(text.contains("Vehicle Registration"),
                "Vehicle registration entry missing");
        assertTrue(text.contains("Identification"), "Identification section missing");
        assertTrue(text.contains("National ID Number"), "National ID number field missing");
        assertTrue(text.contains("Country of Issue"), "Country of issue field missing");
        assertTrue(text.contains("Emergency Contact"), "Emergency contact section missing");
        assertTrue(text.contains("Contact Name"), "Contact name field missing");
        assertTrue(text.contains("Contact Relationship"),
                "Contact relationship field missing");
        assertTrue(text.contains("Contact Phone Number"),
                "Contact phone field missing");
        assertTrue(text.contains("Declaration"), "Declaration section missing");
        assertTrue(text.contains("Applicant Signature"), "Applicant signature line missing");
        assertTrue(text.contains("Administrative Use Only"),
                "Admin section missing");
        assertTrue(text.contains("Application Status"),
                "Admin status field missing");
        assertTrue(text.contains("Admin Comments"), "Admin comments field missing");
        assertTrue(text.contains("Admin Signature"), "Admin signature field missing");
        assertTrue(text.contains("Approval Date"), "Approval date field missing");
    }

    @Test
    void blankFormIsValidPdf() {
        byte[] pdf = service.renderBlankRiderApplicationForm();
        assertTrue(pdf.length > 1024);
        assertStartsWith(pdf, "%PDF-");
    }

    private static String extractText(byte[] pdf) throws Exception {
        try (PdfReader reader = new PdfReader(pdf)) {
            PdfTextExtractor extractor = new PdfTextExtractor(reader);
            StringBuilder sb = new StringBuilder();
            int total = reader.getNumberOfPages();
            for (int i = 1; i <= total; i++) {
                sb.append(extractor.getTextFromPage(i));
            }
            return sb.toString();
        }
    }

    private static void assertStartsWith(byte[] pdf, String prefix) {
        byte[] expected = prefix.getBytes();
        assertTrue(pdf.length >= expected.length,
                "PDF too short to start with the header");
        for (int i = 0; i < expected.length; i++) {
            assertTrue(pdf[i] == expected[i],
                    "PDF header byte " + i + " did not match");
        }
    }
}
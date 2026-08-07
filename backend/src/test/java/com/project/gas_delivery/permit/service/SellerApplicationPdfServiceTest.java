package com.project.gas_delivery.permit.service;

import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Smoke tests for the seller application PDF service. The actual layout
 * is best judged by opening the produced PDF, but we can at least assert
 * the documents are non-trivial PDFs and that all the section labels the
 * product brief requires are present in the rendered content stream.
 */
class SellerApplicationPdfServiceTest {

    private final SellerApplicationPdfService service = new SellerApplicationPdfService();

    @Test
    void blankFormContainsEverySection() throws Exception {
        byte[] pdf = service.renderBlankApplicationForm();
        assertTrue(pdf.length > 1024, "Blank form should be a non-trivial PDF (>1KB)");
        assertStartsWith(pdf, "%PDF-");

        String text = extractText(pdf);
        assertTrue(text.contains("Gas Seller Registration Application Form"),
                "Title missing from blank form");
        assertTrue(text.contains("Applicant Details"), "Applicant section missing");
        assertTrue(text.contains("Full Name"), "Full name field missing");
        assertTrue(text.contains("Date of Birth"), "DOB field missing");
        assertTrue(text.contains("Gender"), "Gender field missing");
        assertTrue(text.contains("Phone Number"), "Phone field missing");
        assertTrue(text.contains("Email"), "Email field missing");
        assertTrue(text.contains("Residential Address"), "Address field missing");
        assertTrue(text.contains("Business Details"), "Business section missing");
        assertTrue(text.contains("Business Name"), "Business name field missing");
        assertTrue(text.contains("Shop Name"), "Shop name field missing");
        assertTrue(text.contains("Shop Address"), "Shop address field missing");
        assertTrue(text.contains("Gas Brands"), "Gas brands field missing");
        assertTrue(text.contains("Business Location"), "Business location field missing");
        assertTrue(text.contains("Documents Required"), "Documents section missing");
        assertTrue(text.contains("Completed Signed Application Form"),
                "Completed application form entry missing");
        assertTrue(text.contains("National ID Copy"), "National ID document missing");
        assertTrue(text.contains("Business License"), "Business license document missing");
        assertTrue(text.contains("Passport Photo"), "Passport photo document missing");
        assertTrue(!text.contains("Gas Selling Permit"),
                "Gas Selling Permit should not appear in the required documents list");
        assertTrue(text.contains("Declaration"), "Declaration section missing");
        assertTrue(text.contains("Applicant Signature"), "Applicant signature line missing");
        assertTrue(text.contains("Administrative Use Only"),
                "Admin section missing");
        assertTrue(text.contains("Application Status"),
                "Admin status field missing");
        assertTrue(text.contains("Admin Comments"),
                "Admin comments field missing");
        assertTrue(text.contains("Admin Signature"),
                "Admin signature field missing");
        assertTrue(text.contains("Approval Date"),
                "Approval date field missing");
    }

    @Test
    void issuedLicenseRendersProvidedData() throws Exception {
        SellerApplicationPdfService.IssuedLicenseData data =
                new SellerApplicationPdfService.IssuedLicenseData(
                        "GSL-000123",
                        "SELL-000001",
                        "Acme Gas Ltd",
                        "1 Market Street, Stone Town",
                        "Retail Gas Outlet",
                        "Stone Town",
                        "Jane Doe",
                        "jane@example.com",
                        "+255700000000",
                        "12 Residential Rd, Stone Town",
                        "Admin Smith",
                        "All documents verified",
                        Instant.parse("2026-07-24T10:15:00Z"),
                        java.time.LocalDate.parse("2026-07-24"),
                        java.time.LocalDate.parse("2027-07-24")
                );

        byte[] pdf = service.renderIssuedLicense(data);
        assertTrue(pdf.length > 1024, "Issued licence should be a non-trivial PDF (>1KB)");
        assertStartsWith(pdf, "%PDF-");

        String text = extractText(pdf);
        assertTrue(text.contains("GAS SELLER LICENCE"),
                "Issued licence title missing");
        assertTrue(text.contains("GSL-000123"), "Registration number missing");
        assertTrue(text.contains("Acme Gas Ltd"), "Business name missing");
        assertTrue(text.contains("Jane Doe"), "Owner name missing");
        assertTrue(text.contains("jane@example.com"), "Owner email missing");
        assertTrue(text.contains("Admin Smith"), "Reviewer name missing");
        assertTrue(text.contains("APPROVED"), "Status stamp missing");
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



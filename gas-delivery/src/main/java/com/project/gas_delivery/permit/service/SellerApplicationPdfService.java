package com.project.gas_delivery.permit.service;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Renders the seller application PDF artifacts using OpenPDF.
 *
 * <p>Two flavours of the form are produced:</p>
 *
 * <ul>
 *   <li>{@link #renderBlankApplicationForm()} – the empty printable form a
 *       seller downloads, prints, completes by hand, signs, and rescans.
 *       Contains every field listed in the product brief (applicant,
 *       business, documents, declaration) with blanks to fill in.</li>
 *   <li>{@link #renderIssuedLicense(IssuedLicenseData)} – the licence
 *       served to the seller once the administrator approves the
 *       application. Re-uses the same template but is pre-populated with
 *       the business / applicant / approval data.</li>
 * </ul>
 */
@Service
public class SellerApplicationPdfService {

    private static final Color HEADER_BG = new Color(20, 64, 110);
    private static final Color SUBTLE_GREY = new Color(236, 240, 245);
    private static final Color ACCENT = new Color(243, 156, 18);

    private static final Font TITLE_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18f, Color.WHITE);
    private static final Font SUBTITLE_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 11f, Color.WHITE);
    private static final Font SECTION_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12f, HEADER_BG);
    private static final Font LABEL_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, Color.DARK_GRAY);
    private static final Font BODY_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 10f, Color.BLACK);
    private static final Font SMALL_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 8.5f, Color.DARK_GRAY);

    /**
     * Render the empty seller application form that a seller can download,
     * print, complete, and sign.
     */
    public byte[] renderBlankApplicationForm() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 48, 48, 60, 60);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new FooterPageEvent("Gas Seller Registration Application Form"));
            document.open();

            document.add(headerBand(
                    "Gas Seller Registration Application Form",
                    "Gas Delivery & Supplying System"));

            document.add(instruction("Please complete every field below in BLOCK "
                    + "letters. Tick boxes where applicable. The completed and "
                    + "signed form must be uploaded back to the system alongside "
                    + "the supporting documents listed in section 3."));

            document.add(section("1. Applicant Details"));
            document.add(fieldTable(List.of(
                    "Full Name",
                    "Date of Birth",
                    "Gender",
                    "Phone Number",
                    "Email",
                    "Residential Address")));

            document.add(section("2. Business Details"));
            document.add(fieldTable(List.of(
                    "Business Name",
                    "Shop Name",
                    "Shop Address",
                    "Gas Brands",
                    "Business Location")));

            document.add(section("3. Documents Required"));
            document.add(checkboxTable(List.of(
                    "Completed Signed Application Form",
                    "National ID Copy",
                    "Business License",
                    "Passport Photo")));

            document.add(section("4. Applicant Declaration"));
            document.add(new Paragraph(
                    "I hereby declare that the information provided in this "
                            + "application is true and correct to the best of my "
                            + "knowledge. I understand that providing false "
                            + "information may result in the rejection of my "
                            + "application and the revocation of any licence "
                            + "issued. I undertake to comply with all applicable "
                            + "regulations governing the sale of liquefied "
                            + "petroleum gas.",
                    BODY_FONT));
            document.add(space(12));
            document.add(signatureTable(
                    "Applicant Signature", "Date"));

            document.add(section("5. Administrative Use Only"));
            PdfPTable admin = new PdfPTable(2);
            admin.setWidthPercentage(100);
            admin.setWidths(new float[]{1, 1});
            admin.addCell(adminCell("Application Status"));
            admin.addCell(adminCell("Pending / Approved / Rejected"));
            admin.addCell(adminCell("Admin Comments"));
            admin.addCell(adminCell(""));
            admin.addCell(adminCell("Admin Signature"));
            admin.addCell(adminCell(""));
            admin.addCell(adminCell("Approval Date"));
            admin.addCell(adminCell(""));
            document.add(admin);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render seller application form: " + e.getMessage(), e);
        }
    }

    /**
     * Render the issued seller licence that is served to a seller once the
     * administrator approves the application.
     */
    public byte[] renderIssuedLicense(IssuedLicenseData data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 48, 48, 60, 60);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new FooterPageEvent(
                    "Gas Seller Licence — " + safe(data.registrationNumber())));
            document.open();

            document.add(headerBand(
                    "GAS SELLER LICENCE",
                    "Issued by the Gas Delivery & Supplying System"));

            PdfPTable meta = new PdfPTable(3);
            meta.setWidthPercentage(100);
            meta.setWidths(new float[]{1.2f, 1.5f, 1.2f});
            meta.addCell(metaCell("Licence No.", safe(data.registrationNumber())));
            meta.addCell(metaCell("Issued", safe(data.approvalDate())));
            meta.addCell(metaCell("Status", "APPROVED"));
            document.add(meta);

            document.add(space(8));
            document.add(section("Business Information"));
            document.add(valueTable(List.of(
                    kv("Business Name", safe(data.businessName())),
                    kv("Business Address", safe(data.businessAddress())),
                    kv("Business Type", safe(data.businessType())),
                    kv("Business Location", safe(data.businessLocation()))
            )));

            document.add(section("Owner Information"));
            document.add(valueTable(List.of(
                    kv("Full Name", safe(data.fullName())),
                    kv("Email", safe(data.email())),
                    kv("Phone", safe(data.phone())),
                    kv("Residential Address", safe(data.residentialAddress()))
            )));

            document.add(section("Documents Verified"));
            PdfPTable docs = new PdfPTable(2);
            docs.setWidthPercentage(100);
            docs.setWidths(new float[]{1.4f, 1});
            for (String label : List.of(
                    "Completed Signed Application Form",
                    "National ID Copy",
                    "Business License",
                    "Passport Photo")) {
                docs.addCell(labelCell(label));
                docs.addCell(valueCell("On file"));
            }
            document.add(docs);

            document.add(section("Administrative Endorsement"));
            PdfPTable admin = new PdfPTable(2);
            admin.setWidthPercentage(100);
            admin.setWidths(new float[]{1, 1});
            admin.addCell(adminCell("Admin Comments"));
            admin.addCell(adminCell(safe(data.adminComments())));
            admin.addCell(adminCell("Admin Signature"));
            admin.addCell(adminCell(safe(data.reviewerName())));
            admin.addCell(adminCell("Approval Date"));
            admin.addCell(adminCell(safe(data.approvalDate())));
            document.add(admin);

            document.add(space(12));
            Paragraph note = new Paragraph(
                    "This licence is non-transferable and remains the property of the "
                            + "issuing authority. It must be displayed at the place of "
                            + "business at all times.",
                    SMALL_FONT);
            note.setAlignment(Element.ALIGN_CENTER);
            document.add(note);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render seller licence: " + e.getMessage(), e);
        }
    }

    // ---- helpers --------------------------------------------------------

    private static PdfPTable headerBand(String title, String subtitle)
            throws Exception {
        PdfPTable band = new PdfPTable(1);
        band.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(HEADER_BG);
        cell.setPadding(14);
        Paragraph t = new Paragraph(title, TITLE_FONT);
        t.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(t);
        Paragraph s = new Paragraph(subtitle, SUBTITLE_FONT);
        s.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(s);
        band.addCell(cell);
        return band;
    }

    private static Paragraph instruction(String text) {
        Paragraph p = new Paragraph(text, BODY_FONT);
        p.setSpacingBefore(10);
        p.setSpacingAfter(10);
        return p;
    }

    private static Paragraph section(String text) {
        Paragraph p = new Paragraph(text, SECTION_FONT);
        p.setSpacingBefore(14);
        p.setSpacingAfter(6);
        return p;
    }

    private static Paragraph space(float pts) {
        Paragraph p = new Paragraph(" ", BODY_FONT);
        p.setSpacingAfter(pts);
        return p;
    }

    private static PdfPTable fieldTable(List<String> labels) throws Exception {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        t.setWidths(new float[]{1, 2});
        for (String label : labels) {
            t.addCell(labelCell(label));
            t.addCell(blankCell());
        }
        return t;
    }

    private static PdfPTable checkboxTable(List<String> labels) throws Exception {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        for (String label : labels) {
            PdfPCell c = new PdfPCell(new Phrase("☐  " + label, BODY_FONT));
            c.setPadding(8);
            c.setBorder(Rectangle.BOX);
            c.setBorderColor(SUBTLE_GREY);
            t.addCell(c);
        }
        return t;
    }

    private static PdfPTable signatureTable(String... labels) throws Exception {
        PdfPTable t = new PdfPTable(labels.length);
        t.setWidthPercentage(100);
        t.setWidths(equalWidths(labels.length));
        for (String label : labels) {
            t.addCell(labelCell(label));
        }
        // signature line
        for (int i = 0; i < labels.length; i++) {
            t.addCell(blankCell(40));
        }
        return t;
    }

    private static PdfPTable valueTable(List<String[]> rows) throws Exception {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        t.setWidths(new float[]{1, 2});
        for (String[] row : rows) {
            t.addCell(labelCell(row[0]));
            t.addCell(valueCell(row[1]));
        }
        return t;
    }

    private static String[] kv(String key, String value) {
        return new String[]{key, value};
    }

    private static PdfPCell labelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, LABEL_FONT));
        c.setBackgroundColor(SUBTLE_GREY);
        c.setPadding(6);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        return c;
    }

    private static PdfPCell valueCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, BODY_FONT));
        c.setPadding(6);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        return c;
    }

    private static PdfPCell blankCell() {
        return blankCell(22);
    }

    private static PdfPCell blankCell(float minHeight) {
        PdfPCell c = new PdfPCell(new Phrase(" ", BODY_FONT));
        c.setMinimumHeight(minHeight);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        return c;
    }

    private static PdfPCell metaCell(String label, String value) {
        PdfPCell wrapper = new PdfPCell();
        wrapper.setBorder(Rectangle.NO_BORDER);
        wrapper.setPadding(6);
        Paragraph p1 = new Paragraph(label, LABEL_FONT);
        Paragraph p2 = new Paragraph(value, BODY_FONT);
        wrapper.addElement(p1);
        wrapper.addElement(p2);
        return wrapper;
    }

    private static PdfPCell adminCell(String value) {
        PdfPCell c = new PdfPCell(new Phrase(value, BODY_FONT));
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        c.setPadding(8);
        c.setMinimumHeight(30);
        return c;
    }

    private static float[] equalWidths(int n) {
        float[] widths = new float[n];
        for (int i = 0; i < n; i++) widths[i] = 1f;
        return widths;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Stamp a footer on every page so the form is identifiable once printed.
     */
    private static final class FooterPageEvent extends PdfPageEventHelper {
        private final String title;

        private FooterPageEvent(String title) {
            this.title = title;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfPTable footer = new PdfPTable(2);
                footer.setWidthPercentage(100);
                footer.setWidths(new float[]{2, 1});
                footer.getDefaultCell().setBorder(Rectangle.NO_BORDER);
                PdfPCell left = new PdfPCell(new Phrase(
                        title + " · Generated " + LocalDate.now(ZoneOffset.UTC)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE),
                        SMALL_FONT));
                left.setBorder(Rectangle.NO_BORDER);
                footer.addCell(left);
                PdfPCell right = new PdfPCell(new Phrase(
                        "Page " + writer.getPageNumber(), SMALL_FONT));
                right.setBorder(Rectangle.NO_BORDER);
                right.setHorizontalAlignment(Element.ALIGN_RIGHT);
                footer.addCell(right);
                footer.setTotalWidth(document.right() - document.left());
                footer.writeSelectedRows(0, -1, document.left(),
                        document.bottom() - 8, writer.getDirectContent());
            } catch (Exception ignored) {
                // best effort
            }
        }
    }

    /**
     * Snapshot of data the issued-licence renderer needs to populate the
     * template. Fields mirror the application / reviewer rows so the
     * controller can build the record without re-querying the database.
     */
    public record IssuedLicenseData(
            String registrationNumber,
            String businessName,
            String businessAddress,
            String businessType,
            String businessLocation,
            String fullName,
            String email,
            String phone,
            String residentialAddress,
            String reviewerName,
            String adminComments,
            Instant reviewedAt
    ) {
        public String approvalDate() {
            return reviewedAt == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE
                            .format(reviewedAt.atZone(ZoneOffset.UTC).toLocalDate());
        }
    }
}

package com.project.gas_delivery.permit.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

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
     *
     * <p><b>Layout.</b> A single A4 LANDSCAPE page (842 × 595 pt) with the
     * following vertical bands, sized to fit comfortably without
     * overflowing:</p>
     *
     * <ol>
     *   <li><b>Header band</b> (~50pt) — navy stripe with the certificate
     *       title and subtitle.</li>
     *   <li><b>Grant of authority</b> (~35pt) — the seller's full name
     *       in large bold + a "Licensed Gas Seller" sub-label.</li>
     *   <li><b>Details grid</b> (~110pt) — the eight essential permit
     *       fields in a 2-column label/value table; the verification
     *       QR sits as a small right-aligned block under the table.</li>
     *   <li><b>Footer row</b> (~70pt) — three side-by-side cells:
     *       authorising-officer signature (left), official seal
     *       (centre), date-issued + certificate-number block (right).</li>
     *   <li><b>Legal note</b> (~10pt) — single-line italic disclaimer
     *       at the very bottom.</li>
     * </ol>
     *
     * <p>The decorative double border, watermark, page number and
     * certificate-number footer line are drawn by
     * {@link CertificatePageEvent} so they stay aligned to the page
     * regardless of how the body content reflows.</p>
     */
    public byte[] renderIssuedLicense(IssuedLicenseData data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            // Tighter margins than the previous design — gives us the
            // ~80pt extra vertical space we need to keep the whole
            // certificate on one landscape page.
            Document document = new Document(PageSize.A4.rotate(), 36, 36, 36, 36);
            PdfWriter writer = PdfWriter.getInstance(document, out);

            final String watermarkText = "APPROVED GAS SELLER";
            writer.setPageEvent(new CertificatePageEvent(
                    safe(data.registrationNumber()),
                    watermarkText));
            document.open();

            // ---- 1. Header band -----------------------------------------
            document.add(certificateHeaderBand());

            // ---- 2. Grant-of-authority block -----------------------------
            // Tighter than the previous design — drop the preamble
            // sentences ("This is to certify that" / "is hereby
            // authorised...") and use a slightly smaller font for the
            // seller name so the whole certificate fits on one
            // landscape A4 page.
            document.add(centeredParagraph(
                    safe(data.fullName()).toUpperCase(),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 22f,
                            new Color(20, 64, 110))));
            document.add(centeredParagraph(
                    "Licensed Gas Seller",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 10f,
                            new Color(80, 90, 110))));

            document.add(space(4));

            // ---- 3. Details grid (flat 2-column table) + QR side block ---
            // Use a SINGLE 2-col flat table for the permit details so
            // OpenPDF cannot split rows across pages. The QR block is
            // a separate paragraph block placed BELOW the details (not
            // in a side cell) — the previous nested-table approach made
            // OpenPDF split the document when the right-hand QR cell
            // was taller than the current page tail, breaking the
            // single-page guarantee.
            PdfPTable fields = new PdfPTable(2);
            fields.setWidthPercentage(100);
            fields.setWidths(new float[]{1.2f, 2.2f});
            // Keep the whole 8-row table on one page — OpenPDF's
            // default would happily split it after the first 5 rows.
            fields.setKeepTogether(true);
            fields.addCell(certLabelCell("Certificate No."));
            fields.addCell(certValueCell(safe(data.registrationNumber())));
            fields.addCell(certLabelCell("Registration No."));
            fields.addCell(certValueCell(safe(data.sellerReferenceNumber())));
            fields.addCell(certLabelCell("Seller Name"));
            fields.addCell(certValueCell(safe(data.fullName())));
            fields.addCell(certLabelCell("Business Name"));
            fields.addCell(certValueCell(safe(data.businessName())));
            fields.addCell(certLabelCell("Business Address"));
            fields.addCell(certValueCell(safe(data.businessAddress())));
            fields.addCell(certLabelCell("Permit Category"));
            fields.addCell(certValueCell(safe(data.businessType())));
            fields.addCell(certLabelCell("Approval Date"));
            fields.addCell(certValueCell(safe(data.approvalDate())));
            fields.addCell(certLabelCell("Expiry Date"));
            fields.addCell(certValueCell(safe(data.validUntilDate())));
            document.add(fields);

            // QR + "Scan to verify" sits as a small standalone block
            // immediately under the field table — narrow and centred so
            // it reads as a verification stamp on the right margin.
            PdfPTable qrBlock = new PdfPTable(1);
            qrBlock.setHorizontalAlignment(Element.ALIGN_RIGHT);
            qrBlock.setWidthPercentage(18);
            qrBlock.setSpacingBefore(4f);
            qrBlock.setSpacingAfter(0f);
            qrBlock.setKeepTogether(true);
            PdfPCell qrInner = new PdfPCell();
            qrInner.setBorder(Rectangle.BOX);
            qrInner.setBorderColor(new Color(180, 188, 200));
            qrInner.setPadding(4);
            qrInner.setHorizontalAlignment(Element.ALIGN_CENTER);
            Image qrImage = buildQrImage(data);
            if (qrImage != null) {
                qrImage.scaleAbsolute(64f, 64f);
                qrInner.addElement(qrImage);
            }
            qrInner.addElement(centeredParagraph("Scan to verify",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f,
                            new Color(20, 64, 110))));
            qrBlock.addCell(qrInner);
            document.add(qrBlock);
            document.add(space(4));

            // ---- 4. Signature / seal / date block -----------------------
            PdfPTable footer = new PdfPTable(3);
            footer.setWidthPercentage(100);
            footer.setWidths(new float[]{1.6f, 1.4f, 1.2f});

            // -- Left: Authorising-officer signature ---------------------
            PdfPCell sigCell = new PdfPCell();
            sigCell.setBorder(Rectangle.NO_BORDER);
            sigCell.setPadding(2);
            sigCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            String officerName = safe(data.reviewerName()).isEmpty()
                    ? "Authorized Officer"
                    : safe(data.reviewerName());
            sigCell.addElement(centeredParagraph(officerName,
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f,
                            new Color(20, 64, 110))));
            sigCell.addElement(centeredParagraph(
                    " ________________________",
                    FontFactory.getFont(FontFactory.HELVETICA, 9f,
                            Color.DARK_GRAY)));
            sigCell.addElement(centeredParagraph(
                    "Authorised Signature \u00b7 Licensing Authority",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f,
                            Color.DARK_GRAY)));
            footer.addCell(sigCell);

            // -- Centre: official seal -----------------------------------
            PdfPCell sealCell = new PdfPCell();
            sealCell.setBorder(Rectangle.NO_BORDER);
            sealCell.setPadding(0);
            sealCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            sealCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            sealCell.addElement(buildOfficialSeal());
            footer.addCell(sealCell);

            // -- Right: date issued + certificate number -----------------
            PdfPCell dateCell = new PdfPCell();
            dateCell.setBorder(Rectangle.NO_BORDER);
            dateCell.setPadding(2);
            dateCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            dateCell.addElement(centeredParagraph("Date Issued",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f,
                            Color.DARK_GRAY)));
            dateCell.addElement(centeredParagraph(safe(data.approvalDate()),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f,
                            new Color(20, 64, 110))));
            dateCell.addElement(space(3));
            dateCell.addElement(centeredParagraph("Certificate No.",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f,
                            Color.DARK_GRAY)));
            dateCell.addElement(centeredParagraph(safe(data.registrationNumber()),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f,
                            new Color(20, 64, 110))));
            footer.addCell(dateCell);

            document.add(footer);

            // ---- 5. Legal note ------------------------------------------
            Paragraph note = new Paragraph(
                    "Issued under the authority of the Gas Delivery & Supplying Authority \u00b7 "
                            + "Non-transferable \u00b7 Must be displayed at the place of business.",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7.5f, Color.DARK_GRAY));
            note.setAlignment(Element.ALIGN_CENTER);
            note.setSpacingBefore(2f);
            document.add(note);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render seller licence: " + e.getMessage(), e);
        }
    }

    /**
     * Build a circular "official seal" composed of two concentric
     * rounded rectangles plus three lines of bold uppercase text. The
     * seal is a single-column {@link PdfPTable} so the renderer handles
     * the centering and the table cell carries the right vertical
     * padding without us having to hand-position every glyph.
     *
     * <p>The seal uses the official burgundy colour ({@link #SEAL_COLOR})
     * and Helvetica Bold so it reproduces identically across devices
     * without depending on an embedded bitmap.</p>
     */
    private static PdfPTable buildOfficialSeal() {
        Color SEAL_COLOR = new Color(160, 30, 30);
        PdfPTable seal = new PdfPTable(1);
        seal.setWidthPercentage(100);
        PdfPCell outer = new PdfPCell();
        outer.setBorder(Rectangle.BOX);
        outer.setBorderColor(SEAL_COLOR);
        outer.setBorderWidth(2.2f);
        outer.setPadding(6);
        outer.setHorizontalAlignment(Element.ALIGN_CENTER);
        outer.setVerticalAlignment(Element.ALIGN_MIDDLE);
        outer.setMinimumHeight(64f);
        outer.setPadding(2);
        outer.addElement(centeredParagraph("OFFICIAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph("APPROVAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph("SEAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph(
                "Gas Delivery & Supplying Authority",
                FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7f,
                        Color.GRAY)));
        seal.addCell(outer);
        return seal;
    }

    /**
     * Render the QR image (PNG byte buffer → OpenPDF Image) used as the
     * "scan to verify" stamp on the certificate. Returns {@code null}
     * rather than throwing when QR generation fails so a missing
     * verification image never blocks a legitimate download — the
     * certificate stays valid and the admin can re-issue if needed.
     *
     * <p>The encoded payload is a deterministic deep-link built from the
     * certificate's registration number. Scanners land on the public
     * certificate-lookup path (the page itself can be wired up in a
     * future release; today it's informational).</p>
     */
    private static Image buildQrImage(IssuedLicenseData data) {
        String payload = "GasDeliveryPermit:" + safe(data.registrationNumber());
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.ERROR_CORRECTION,
                    com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(payload, BarcodeFormat.QR_CODE, 240, 240, hints);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", png);
            return Image.getInstance(png.toByteArray());
        } catch (WriterException | IOException e) {
            // Best-effort — the certificate is still valid without the QR.
            return null;
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
            String sellerReferenceNumber,
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
            Instant reviewedAt,
            LocalDate validFrom,
            LocalDate validUntil
    ) {
        public String approvalDate() {
            return reviewedAt == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE
                            .format(reviewedAt.atZone(ZoneOffset.UTC).toLocalDate());
        }

        public String validFromDate() {
            return validFrom == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE.format(validFrom);
        }

        public String validUntilDate() {
            return validUntil == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE.format(validUntil);
        }
    }

    // ---- Certificate-specific helpers (landscape layout) ----------------

    /**
     * Header band at the top of the certificate: a coloured bar carrying
     * the official title and subtitle. Wider than the A4 portrait band
     * because we now operate in landscape — the title sits centred above
     * the seller name so it reads as the certificate's primary heading.
     */
    private static PdfPTable certificateHeaderBand() {
        PdfPTable band = new PdfPTable(1);
        band.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(HEADER_BG);
        cell.setPadding(10);
        Paragraph t = new Paragraph(
                "GAS SELLING PERMIT CERTIFICATE",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 22f, Color.WHITE));
        t.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(t);
        Paragraph s = new Paragraph(
                "Official Authorization to Operate as a Licensed Gas Seller",
                FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 11f, Color.WHITE));
        s.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(s);
        band.addCell(cell);
        return band;
    }

    /** Tiny wrapper so we can build centred paragraphs at any font size. */
    private static Paragraph centeredParagraph(String text, Font font) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        return p;
    }

    /** Lighter-weight label cell for the certificate details table. */
    private static PdfPCell certLabelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, LABEL_FONT));
        c.setBackgroundColor(SUBTLE_GREY);
        c.setPadding(4);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    /** Body cell for the certificate details table — bigger padding than
     *  the legacy admin form so the printed certificate breathes. */
    private static PdfPCell certValueCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, BODY_FONT));
        c.setPadding(4);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    /**
     * Page event that draws a coloured decorative frame around every page
     * AND a translucent "APPROVED GAS SELLER" watermark behind the body
     * text. We replaced the simple footer page event so the certificate
     * looks like a real official permit, not a printout of a web form.
     */
    private static final class CertificatePageEvent extends PdfPageEventHelper {

        private final String certificateNumber;
        private final String watermarkText;

        private CertificatePageEvent(String certificateNumber, String watermarkText) {
            this.certificateNumber = certificateNumber;
            this.watermarkText = watermarkText;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfContentByte canvas = writer.getDirectContentUnder();

                // ---- Outer decorative border ----------------------------
                Rectangle page = document.getPageSize();
                float outerInset = 18f;
                float innerInset = 22f;
                Rectangle outer = new Rectangle(
                        page.getLeft() + outerInset,
                        page.getBottom() + outerInset,
                        page.getRight() - outerInset,
                        page.getTop() - outerInset);
                outer.setBorderWidth(2.4f);
                outer.setBorderColor(new Color(20, 64, 110));
                canvas.rectangle(outer);

                Rectangle inner = new Rectangle(
                        page.getLeft() + innerInset,
                        page.getBottom() + innerInset,
                        page.getRight() - innerInset,
                        page.getTop() - innerInset);
                inner.setBorderWidth(0.6f);
                inner.setBorderColor(new Color(180, 188, 200));
                canvas.rectangle(inner);

                // ---- Watermark (centred, diagonal, low alpha) -----------
                // Use ColumnText.showTextAligned rather than raw
                // beginText/endText + showTextAligned nesting: the raw
                // path pulls `Phrase.getContent()` (which is null when the
                // Phrase was built from a Font alone) into
                // `PdfContentByte.showTextAligned(String, ...)`, leaving
                // the begin/end text operator counts unbalanced and
                // crashing the document at close time. ColumnText manages
                // the text matrix and operators internally, and accepts
                // the Phrase directly.
                Font watermarkFont = FontFactory.getFont(
                        FontFactory.HELVETICA_BOLD, 64f, new Color(220, 220, 230));
                Phrase phrase = new Phrase(watermarkText, watermarkFont);
                float x = (page.getLeft() + page.getRight()) / 2f;
                float y = (page.getBottom() + page.getTop()) / 2f;
                canvas.saveState();
                canvas.setColorFill(new Color(220, 220, 230));
                ColumnText.showTextAligned(canvas, Element.ALIGN_CENTER,
                        phrase, x, y, 30f);
                canvas.restoreState();

                // ---- Footer line: certificate number + page number ------
                // Same ColumnText path for the same reason — Phrase +
                // raw showTextAligned has been a recurring footgun here.
                canvas = writer.getDirectContent();
                Phrase left = new Phrase(
                        "Certificate " + certificateNumber + " · Generated "
                                + LocalDate.now(ZoneOffset.UTC)
                                        .format(DateTimeFormatter.ISO_LOCAL_DATE),
                        FontFactory.getFont(FontFactory.HELVETICA, 8f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                        left, document.left(), document.bottom() - 12, 0f);

                Phrase right = new Phrase(
                        "Page " + writer.getPageNumber(),
                        FontFactory.getFont(FontFactory.HELVETICA, 8f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_RIGHT,
                        right, document.right(), document.bottom() - 12, 0f);
            } catch (Exception ignored) {
                // Best effort — the certificate stays valid even if the
                // decorative layer fails to render.
            }
        }
    }
}

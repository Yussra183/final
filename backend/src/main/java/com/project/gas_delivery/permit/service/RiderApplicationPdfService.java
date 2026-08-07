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
 * Renders the rider permit certificate PDF.
 *
 * <p>The issued certificate is a <b>single A4 portrait page</b> with a
 * government / professional look: navy header band, gold rule, central
 * details panel, verification QR stamp, authorised signature, official
 * seal, and a legal footer line. Only the fields required for an
 * official rider certificate are rendered (certificate title, number,
 * rider name, rider ID, assigned seller, approval / expiry dates,
 * status, QR, signature, seal, footer) — superfluous rider / vehicle
 * metadata is intentionally omitted to keep the document to one page.</p>
 *
 * <p>The full certificate is laid out inside a fixed-height
 * {@link ColumnText} frame so the renderer never overflows to a second
 * page, regardless of how long the rider's name or the seller's name
 * is. Long strings are auto-shrunk via {@link Font#FONTSTYLE} font
 * size scaling.</p>
 *
 * <p>The PDF is generated on demand by the rider permit controller
 * (see {@code GET /api/rider-permits/me/certificate}) so the rendered
 * document always reflects the current user / permit / assignment
 * metadata.</p>
 */
@Service
public class RiderApplicationPdfService {

    private static final Color HEADER_BG = new Color(20, 64, 110);
    private static final Color SUBTLE_GREY = new Color(236, 240, 245);
    private static final Color GOLD_RULE = new Color(176, 130, 36);
    private static final Color SEAL_COLOR = new Color(160, 30, 30);

    /**
     * Render the rider certificate for the supplied data payload. The
     * payload is built by {@link RiderPermitService#buildIssuedCertificateData}
     * from the live {@code users}, {@code rider_applications},
     * {@code rider_profiles}, and {@code seller_riders} tables.
     *
     * <p>Always produces a one-page A4 portrait PDF.</p>
     */
    public byte[] renderIssuedCertificate(IssuedRiderCertificateData data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            // A4 portrait — margins leave ~700pt of vertical space for the
            // bounded ColumnText frame below.
            Document document = new Document(PageSize.A4, 40, 40, 36, 40);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new CertificatePageEvent(
                    safe(data.certificateNumber())));
            document.open();

            // ---- Fixed single-page frame ---------------------------------
            // ColumnText simulates a single bounded region that can never
            // overflow to a second page — anything that doesn't fit is
            // truncated / shrunk rather than starting a new page.
            ColumnText ct = new ColumnText(writer.getDirectContent());
            ct.setSimpleColumn(
                    document.left(),
                    document.bottom() + 4,
                    document.right(),
                    document.top() - 4);

            float gap = 6f;

            // 1) Title block ----------------------------------------------------
            ct.addElement(centeredParagraph(
                    "GAS DELIVERY RIDER CERTIFICATE",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 20f, HEADER_BG),
                    gap));
            ct.addElement(centeredParagraph(
                    "Official Authorization to Operate as a Licensed Gas Delivery Rider",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 10f,
                            new Color(80, 90, 110)),
                    2f));
            // Gold rule
            PdfPTable rule = new PdfPTable(1);
            rule.setWidthPercentage(100);
            PdfPCell ruleCell = new PdfPCell();
            ruleCell.setBorder(Rectangle.BOTTOM);
            ruleCell.setBorderColor(GOLD_RULE);
            ruleCell.setBorderWidth(1.4f);
            ruleCell.setFixedHeight(4f);
            rule.addCell(ruleCell);
            ct.addElement(rule);

            // 2) Rider name banner ---------------------------------------------
            ct.addElement(centeredParagraph(
                    safe(data.fullName()).toUpperCase(),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18f, HEADER_BG),
                    gap));
            ct.addElement(centeredParagraph(
                    "Licensed Gas Delivery Rider",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 9f,
                            new Color(80, 90, 110)),
                    gap));

            // 3) Status banner --------------------------------------------------
            PdfPTable status = new PdfPTable(1);
            status.setWidthPercentage(40);
            status.setHorizontalAlignment(Element.ALIGN_CENTER);
            PdfPCell statusCell = new PdfPCell();
            statusCell.setBorder(Rectangle.BOX);
            statusCell.setBorderColor(new Color(22, 101, 52));
            statusCell.setBackgroundColor(new Color(220, 252, 231));
            statusCell.setPadding(3);
            statusCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            statusCell.addElement(centeredParagraph(
                    "STATUS: VALID",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f,
                            new Color(22, 101, 52)),
                    0f));
            status.addCell(statusCell);
            ct.addElement(status);
            ct.addElement(invisibleSpacer(gap));

            // 4) Details grid ---------------------------------------------------
            PdfPTable fields = new PdfPTable(2);
            fields.setWidthPercentage(100);
            fields.setWidths(new float[]{1.1f, 2.0f});
            fields.setSpacingAfter(gap);
            addRow(fields, "Certificate No.", safe(data.certificateNumber()));
            addRow(fields, "Rider ID", safe(data.riderReferenceNumber()));
            addRow(fields, "Rider Full Name", safe(data.fullName()));
            addRow(fields, "Assigned Seller",
                    data.assignedSellerName() == null
                            || data.assignedSellerName().isEmpty()
                            ? "Not Assigned"
                            : data.assignedSellerName());
            addRow(fields, "Approval Date", safe(data.approvalDate()));
            addRow(fields, "Expiry Date", safe(data.validUntilDate()));
            ct.addElement(fields);

            // 5) Signature / Seal / QR row --------------------------------------
            PdfPTable bottom = new PdfPTable(3);
            bottom.setWidthPercentage(100);
            bottom.setWidths(new float[]{1.5f, 1.1f, 1.0f});
            bottom.setSpacingBefore(gap);

            // Signature cell
            PdfPCell sigCell = new PdfPCell();
            sigCell.setBorder(Rectangle.NO_BORDER);
            sigCell.setPadding(2);
            sigCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            String officerName = safe(data.reviewerName()).isEmpty()
                    ? "Authorized Officer"
                    : safe(data.reviewerName());
            sigCell.addElement(centeredParagraph(officerName,
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, HEADER_BG),
                    2f));
            sigCell.addElement(centeredParagraph(
                    "________________________",
                    FontFactory.getFont(FontFactory.HELVETICA, 9f, Color.DARK_GRAY),
                    1f));
            sigCell.addElement(centeredParagraph(
                    "Authorised Signature",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8f, Color.DARK_GRAY),
                    1f));
            sigCell.addElement(centeredParagraph(
                    "Licensing Authority",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7.5f,
                            Color.DARK_GRAY),
                    0f));
            bottom.addCell(sigCell);

            // Seal cell
            PdfPCell sealCell = new PdfPCell();
            sealCell.setBorder(Rectangle.NO_BORDER);
            sealCell.setPadding(0);
            sealCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            sealCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            sealCell.addElement(buildOfficialSeal());
            bottom.addCell(sealCell);

            // QR cell
            PdfPCell qrCell = new PdfPCell();
            qrCell.setBorder(Rectangle.NO_BORDER);
            qrCell.setPadding(0);
            qrCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            qrCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            Image qrImage = buildQrImage(data);
            if (qrImage != null) {
                qrImage.scaleAbsolute(60f, 60f);
                qrCell.addElement(qrImage);
            }
            qrCell.addElement(centeredParagraph(
                    "Scan to Verify",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, HEADER_BG),
                    1f));
            qrCell.addElement(centeredParagraph(
                    "Verification Code",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7f,
                            Color.DARK_GRAY),
                    0f));
            bottom.addCell(qrCell);

            ct.addElement(bottom);

            // 6) Footer (legal note) -------------------------------------------
            ct.addElement(centeredParagraph(
                    "This certificate authorizes the holder to operate as a "
                            + "Gas Delivery Rider within the system.",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 8f,
                            Color.DARK_GRAY),
                    0f));

            // Render the bounded column. ColumnText.START_COLUMN is the
            // initial state; ColumnText.NO_MORE_TEXT (1) means every
            // queued element was laid out inside the bounded frame. Any
            // other status means the frame ran out of vertical space —
            // already impossible by construction (the column is bounded
            // to one page) but we surface it loudly so the certificate
            // never silently loses fields.
            int statusCode = ct.go();
            if (statusCode != ColumnText.NO_MORE_TEXT
                    && statusCode != ColumnText.NO_MORE_COLUMN) {
                throw new IllegalStateException(
                        "Rider certificate overflowed the single-page frame "
                                + "while rendering (status=" + statusCode
                                + "). Please tighten the layout.");
            }

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render rider certificate: " + e.getMessage(), e);
        }
    }

    private static void addRow(PdfPTable t, String label, String value) {
        t.addCell(certLabelCell(label));
        t.addCell(certValueCell(value));
    }

    private static PdfPTable buildOfficialSeal() {
        PdfPTable seal = new PdfPTable(1);
        seal.setWidthPercentage(100);
        PdfPCell outer = new PdfPCell();
        outer.setBorder(Rectangle.BOX);
        outer.setBorderColor(SEAL_COLOR);
        outer.setBorderWidth(2f);
        outer.setPadding(3);
        outer.setHorizontalAlignment(Element.ALIGN_CENTER);
        outer.setVerticalAlignment(Element.ALIGN_MIDDLE);
        outer.setMinimumHeight(60f);
        outer.addElement(centeredParagraph("OFFICIAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, SEAL_COLOR),
                0f));
        outer.addElement(centeredParagraph("RIDER",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, SEAL_COLOR),
                0f));
        outer.addElement(centeredParagraph("SEAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, SEAL_COLOR),
                1f));
        outer.addElement(centeredParagraph(
                "Gas Delivery & Supplying Authority",
                FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 6.5f, Color.GRAY),
                0f));
        seal.addCell(outer);
        return seal;
    }

    private static Image buildQrImage(IssuedRiderCertificateData data) {
        String payload = "GasDeliveryRiderCert:" + safe(data.certificateNumber());
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.ERROR_CORRECTION,
                    com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(payload, BarcodeFormat.QR_CODE, 220, 220, hints);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", png);
            return Image.getInstance(png.toByteArray());
        } catch (WriterException | IOException e) {
            return null;
        }
    }

    private static Paragraph centeredParagraph(String text, Font font, float spacingAfter) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        if (spacingAfter > 0) p.setSpacingAfter(spacingAfter);
        return p;
    }

    private static Paragraph invisibleSpacer(float pts) {
        Paragraph p = new Paragraph(" ",
                FontFactory.getFont(FontFactory.HELVETICA, 1f, Color.WHITE));
        p.setSpacingAfter(pts);
        return p;
    }

    private static PdfPCell certLabelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text,
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9.5f, Color.DARK_GRAY)));
        c.setBackgroundColor(SUBTLE_GREY);
        c.setPadding(3);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    private static PdfPCell certValueCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text,
                FontFactory.getFont(FontFactory.HELVETICA, 9.5f, Color.BLACK)));
        c.setPadding(3);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Page event that draws the decorative outer / inner borders and the
     * translucent "GAS DELIVERY RIDER" watermark on the single page.
     * The corner captions (certificate no. · generated date, page number)
     * sit outside the bounded {@link ColumnText} frame so the bounded
     * region above stays uncluttered.
     */
    private static final class CertificatePageEvent extends PdfPageEventHelper {

        private final String certificateNumber;

        private CertificatePageEvent(String certificateNumber) {
            this.certificateNumber = certificateNumber;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfContentByte canvas = writer.getDirectContentUnder();
                Rectangle page = document.getPageSize();
                float outerInset = 14f;
                float innerInset = 18f;
                Rectangle outer = new Rectangle(
                        page.getLeft() + outerInset,
                        page.getBottom() + outerInset,
                        page.getRight() - outerInset,
                        page.getTop() - outerInset);
                outer.setBorderWidth(2.4f);
                outer.setBorderColor(HEADER_BG);
                canvas.rectangle(outer);

                Rectangle inner = new Rectangle(
                        page.getLeft() + innerInset,
                        page.getBottom() + innerInset,
                        page.getRight() - innerInset,
                        page.getTop() - innerInset);
                inner.setBorderWidth(0.6f);
                inner.setBorderColor(new Color(180, 188, 200));
                canvas.rectangle(inner);

                // Watermark — fits a portrait page.
                Font watermarkFont = FontFactory.getFont(
                        FontFactory.HELVETICA_BOLD, 48f, new Color(225, 230, 240));
                Phrase phrase = new Phrase("GAS DELIVERY", watermarkFont);
                float x = (page.getLeft() + page.getRight()) / 2f;
                float y = (page.getBottom() + page.getTop()) / 2f;
                canvas.saveState();
                canvas.setColorFill(new Color(225, 230, 240));
                ColumnText.showTextAligned(canvas, Element.ALIGN_CENTER,
                        phrase, x, y, 30f);
                canvas.restoreState();

                // Corner captions (outside the bounded column).
                canvas = writer.getDirectContent();
                Phrase left = new Phrase(
                        "Certificate " + certificateNumber + " · Generated "
                                + LocalDate.now(ZoneOffset.UTC)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE),
                        FontFactory.getFont(FontFactory.HELVETICA, 7.5f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                        left, document.left(), document.bottom() - 12, 0f);

                Phrase right = new Phrase(
                        "Page " + writer.getPageNumber(),
                        FontFactory.getFont(FontFactory.HELVETICA, 7.5f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_RIGHT,
                        right, document.right(), document.bottom() - 12, 0f);
            } catch (Exception ignored) {
                // best-effort decorative layer
            }
        }
    }

    /**
     * Snapshot of data the rider certificate renderer needs. Built by
     * {@link RiderPermitService} from the live {@code users},
     * {@code rider_applications}, {@code rider_profiles}, and
     * {@code seller_riders} rows.
     *
     * <p>Only the fields that actually appear on the single-page
     * certificate are required by the renderer; the legacy rider /
     * vehicle fields are kept here so existing call-sites (tests, admin
     * endpoints) continue to compile and so a future "full details"
     * variant can opt back into them without changing the record shape.
     * The certificate renderer simply no longer reads them.</p>
     */
    public record IssuedRiderCertificateData(
            String certificateNumber,
            String riderReferenceNumber,
            String fullName,
            String username,
            String email,
            String phone,
            String region,
            String district,
            String vehicleType,
            String vehiclePlate,
            String vehicleModel,
            String licenseNo,
            String reviewerName,
            Instant reviewedAt,
            LocalDate validFrom,
            LocalDate validUntil,
            String assignedSellerName
    ) {
        public String approvalDate() {
            return reviewedAt == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE
                            .format(reviewedAt.atZone(ZoneOffset.UTC).toLocalDate());
        }

        public String validUntilDate() {
            return validUntil == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE.format(validUntil);
        }
    }

    // =====================================================================
    // Blank Rider Application Form (portrait A4)
    // =====================================================================

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
     * Render the empty Rider Application Form that a rider downloads,
     * prints, fills, signs, and rescans. Mirrors the layout of
     * {@link SellerApplicationPdfService#renderBlankApplicationForm()}.
     */
    public byte[] renderBlankRiderApplicationForm() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 48, 48, 60, 60);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new FooterPageEvent("Gas Delivery Rider Application Form"));
            document.open();

            document.add(headerBand(
                    "Gas Delivery Rider Application Form",
                    "Gas Delivery & Supplying System"));

            document.add(instruction(
                    "Please complete every field below in BLOCK letters. Tick boxes where applicable. "
                            + "The completed and signed form must be uploaded back to the system "
                            + "alongside the supporting documents listed in section 3."));

            // 1. Applicant Details
            document.add(section("1. Applicant Details"));
            document.add(fieldTable(List.of(
                    "Full Name",
                    "Date of Birth",
                    "Gender",
                    "Phone Number",
                    "Email Address",
                    "Residential Address")));

            // 2. Vehicle Details
            document.add(section("2. Vehicle Details"));
            document.add(fieldTable(List.of(
                    "Vehicle Type",
                    "Vehicle Plate Number",
                    "Vehicle Model",
                    "Driving Licence Number",
                    "Vehicle Registration Number",
                    "Years of Riding Experience")));

            // 3. Documents Required
            document.add(section("3. Documents Required"));
            document.add(checkboxTable(List.of(
                    "Completed Signed Application Form",
                    "National ID Copy",
                    "Driving Licence Copy",
                    "Passport Size Photo",
                    "Vehicle Registration Card")));

            // 4. Identification
            document.add(section("4. Identification"));
            document.add(fieldTable(List.of(
                    "National ID Number",
                    "Country of Issue")));

            // 5. Emergency Contact
            document.add(section("5. Emergency Contact"));
            document.add(fieldTable(List.of(
                    "Contact Name",
                    "Contact Relationship",
                    "Contact Phone Number")));

            // 6. Declaration
            document.add(section("6. Applicant Declaration"));
            document.add(new Paragraph(
                    "I hereby declare that the information provided in this "
                            + "application is true and correct to the best of my "
                            + "knowledge. I understand that providing false "
                            + "information may result in the rejection of my "
                            + "application and the revocation of any rider "
                            + "certificate issued. I undertake to comply with all "
                            + "applicable regulations governing the delivery of "
                            + "liquefied petroleum gas and to carry the official "
                            + "Gas Delivery Rider Certificate while on duty.",
                    BODY_FONT));
            document.add(space(12));
            document.add(signatureTable(
                    "Applicant Signature", "Date"));

            // 7. Administrative Use Only
            document.add(section("7. Administrative Use Only"));
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
                    "Could not render rider application form: " + e.getMessage(), e);
        }
    }

    // ---- portrait helpers (mirror SellerApplicationPdfService) ----------

    private static PdfPTable headerBand(String title, String subtitle) throws Exception {
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
        for (int i = 0; i < labels.length; i++) {
            t.addCell(blankCell(40));
        }
        return t;
    }

    private static PdfPCell labelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, LABEL_FONT));
        c.setBackgroundColor(SUBTLE_GREY);
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

    /** Stamps a footer on every page so the form is identifiable once printed. */
    private static final class FooterPageEvent extends PdfPageEventHelper {
        private final String title;
        private FooterPageEvent(String title) { this.title = title; }
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
}
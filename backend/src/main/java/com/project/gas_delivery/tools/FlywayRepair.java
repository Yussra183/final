package com.project.gas_delivery.tools;

import org.flywaydb.core.Flyway;

/**
 * One-shot CLI utility to reconcile the {@code flyway_schema_history}
 * table against the current state of the migration files on disk.
 *
 * <p>Run with:</p>
 * <pre>
 *   mvn -q exec:java -Dexec.mainClass=com.project.gas_delivery.tools.FlywayRepair \
 *       -Dexec.args="jdbc:postgresql://localhost:5432/gas_delivery_db postgres 123456"
 * </pre>
 *
 * <p>Used after editing the body of an already-applied migration (e.g.
 * a comment-only change). Spring Boot's auto-configured Flyway will
 * reject any checksum drift on startup; this utility lets the operator
 * accept the new checksum without dropping the schema.</p>
 *
 * <p>After running this, the dev DB schema matches the migration files
 * on disk; no SQL is re-run.</p>
 */
public final class FlywayRepair {

    private FlywayRepair() {}

    public static void main(String[] args) {
        if (args.length != 3) {
            System.err.println("Usage: FlywayRepair <url> <user> <password>");
            System.exit(2);
        }
        String url = args[0];
        String user = args[1];
        String password = args[2];

        Flyway flyway = Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .load();
        flyway.repair();
        System.out.println("Flyway repair complete. Schema history reconciled.");
    }
}

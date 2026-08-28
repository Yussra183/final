package com.project.gas_delivery;

import com.project.gas_delivery.common.storage.FileStorageProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Boot entry point.
 *
 * <p>{@link EnableConfigurationProperties} binds
 * {@link FileStorageProperties} from {@code app.uploads.*} so the permit
 * workflow can read the upload directory without hard-coding it.</p>
 *
 * <p>{@link EnableScheduling} activates the rider pickup-hold
 * expiration sweep — the rider has a bounded window to reach the
 * seller, and the backend reverts stale holds server-side so the
 * frontend countdown is never the only source of truth.</p>
 */
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(FileStorageProperties.class)
public class GasDeliveryApplication {

	public static void main(String[] args) {
		SpringApplication.run(GasDeliveryApplication.class, args);
	}

}

package com.project.gas_delivery;

import com.project.gas_delivery.common.storage.FileStorageProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * Boot entry point.
 *
 * <p>{@link EnableConfigurationProperties} binds
 * {@link FileStorageProperties} from {@code app.uploads.*} so the permit
 * workflow can read the upload directory without hard-coding it.</p>
 */
@SpringBootApplication
@EnableConfigurationProperties(FileStorageProperties.class)
public class GasDeliveryApplication {

	public static void main(String[] args) {
		SpringApplication.run(GasDeliveryApplication.class, args);
	}

}

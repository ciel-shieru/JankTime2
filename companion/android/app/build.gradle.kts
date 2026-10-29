plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// CI supplies a repository-owned debug key through environment variables. Local
// development remains on Android Gradle Plugin's standard debug keystore.
val ciDebugKeystorePath = providers.environmentVariable("ANDROID_DEBUG_KEYSTORE_PATH").orNull
val ciDebugStorePassword = providers.environmentVariable("ANDROID_DEBUG_KEYSTORE_STORE_PASSWORD").orNull
val ciDebugKeyPassword = providers.environmentVariable("ANDROID_DEBUG_KEYSTORE_KEY_PASSWORD").orNull
val ciDebugKeyAlias = providers.environmentVariable("ANDROID_DEBUG_KEYSTORE_KEY_ALIAS").orNull

android {
    namespace = "com.cielshieru.janktime2"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.cielshieru.janktime2"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (ciDebugKeystorePath != null) {
            create("ciDebug") {
                storeFile = file(ciDebugKeystorePath)
                storePassword = ciDebugStorePassword ?: error("CI debug keystore store password is missing.")
                keyPassword = ciDebugKeyPassword ?: error("CI debug keystore key password is missing.")
                keyAlias = ciDebugKeyAlias?.takeIf { it.isNotBlank() }
                    ?: error("CI debug keystore alias is missing.")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
            if (ciDebugKeystorePath != null) signingConfig = signingConfigs.getByName("ciDebug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.pebblekit)
    implementation(libs.okhttp)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    debugImplementation(libs.androidx.ui.tooling)
}

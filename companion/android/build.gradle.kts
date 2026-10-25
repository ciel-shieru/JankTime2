plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

// Lock transitive dependencies for all configurations in the root and subprojects.
// Generated gradle.lockfile files are checked in and reviewed with dependency upgrades.
dependencyLocking {
    lockAllConfigurations()
}

subprojects {
    dependencyLocking {
        lockAllConfigurations()
    }
}

package com.cielshieru.janktime2.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter

/** Downscales/crops on the phone to a 30x30 one-bit map before any BLE transfer. */
class PixelImageStore(private val context: Context) {
    fun importFromUri(uri: Uri): List<String> {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { input -> BitmapFactory.decodeStream(input, null, bounds) }
            ?: throw IOException("Unable to open selected image.")
        val width = bounds.outWidth
        val height = bounds.outHeight
        require(width in 1..MAX_SOURCE_EDGE && height in 1..MAX_SOURCE_EDGE) {
            "Image dimensions are outside the allowed range."
        }
        require(width.toLong() * height.toLong() <= MAX_SOURCE_PIXELS) {
            "Image has too many pixels."
        }

        var sampleSize = 1
        while (width / sampleSize > MAX_DECODE_EDGE || height / sampleSize > MAX_DECODE_EDGE) sampleSize *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val decoded = resolver.openInputStream(uri)?.use { input -> BitmapFactory.decodeStream(input, null, options) }
            ?: throw IOException("Unable to decode selected image.")

        val cropped = centerCrop(decoded, TARGET_SIZE, TARGET_SIZE)
        val scaled = Bitmap.createScaledBitmap(cropped, TARGET_SIZE, TARGET_SIZE, true)
        if (cropped !== decoded) cropped.recycle()
        if (decoded !== cropped && decoded !== scaled) decoded.recycle()

        return try {
            val rows = buildList(TARGET_SIZE) {
                for (y in 0 until TARGET_SIZE) {
                    val row = StringBuilder(TARGET_SIZE)
                    for (x in 0 until TARGET_SIZE) {
                        val pixel = scaled.getPixel(x, y)
                        val red = (pixel shr 16) and 0xff
                        val green = (pixel shr 8) and 0xff
                        val blue = pixel and 0xff
                        val luminance = (299 * red + 587 * green + 114 * blue) / 1000
                        row.append(if (luminance < THRESHOLD) '1' else '0')
                    }
                    add(row.toString())
                }
            }
            saveRows(rows)
            rows
        } finally {
            scaled.recycle()
            if (cropped !== decoded && cropped !== scaled && !cropped.isRecycled) cropped.recycle()
            if (decoded !== scaled && !decoded.isRecycled) decoded.recycle()
        }
    }

    fun loadRows(): List<String>? {
        val file = context.getFileStreamPath(IMAGE_FILE)
        if (!file.isFile || file.length() > MAX_IMAGE_BYTES) return null
        return runCatching {
            BufferedReader(InputStreamReader(context.openFileInput(IMAGE_FILE), Charsets.US_ASCII)).use { reader ->
                val rows = reader.readLines()
                rows.takeIf { it.size == TARGET_SIZE && it.all { row -> row.matches(Regex("[01]{$TARGET_SIZE}")) } }
            }
        }.getOrNull()
    }

    fun restoreRows(rows: List<String>) {
        require(rows.size == TARGET_SIZE && rows.all { row ->
            row.length == TARGET_SIZE && row.all { it == '0' || it == '1' }
        }) { "Image pixel map is invalid." }
        saveRows(rows)
    }

    fun clear() {
        context.deleteFile(IMAGE_FILE)
    }

    private fun saveRows(rows: List<String>) {
        require(rows.size == TARGET_SIZE && rows.all { row -> row.length == TARGET_SIZE && row.all { it == '0' || it == '1' } }) {
            "Image pixel map is invalid."
        }
        BufferedWriter(OutputStreamWriter(context.openFileOutput(IMAGE_FILE, Context.MODE_PRIVATE), Charsets.US_ASCII)).use { writer ->
            rows.forEach { writer.append(it).append('\n') }
        }
    }

    private fun centerCrop(bitmap: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val sourceRatio = bitmap.width.toDouble() / bitmap.height.toDouble()
        val targetRatio = targetWidth.toDouble() / targetHeight.toDouble()
        return if (sourceRatio > targetRatio) {
            val cropWidth = (bitmap.height * targetRatio).toInt().coerceIn(1, bitmap.width)
            Bitmap.createBitmap(bitmap, (bitmap.width - cropWidth) / 2, 0, cropWidth, bitmap.height)
        } else {
            val cropHeight = (bitmap.width / targetRatio).toInt().coerceIn(1, bitmap.height)
            Bitmap.createBitmap(bitmap, 0, (bitmap.height - cropHeight) / 2, bitmap.width, cropHeight)
        }
    }

    companion object {
        const val TARGET_SIZE = 30
        private const val IMAGE_FILE = "janktime2-user-image.rows"
        private const val MAX_SOURCE_EDGE = 12000
        private const val MAX_SOURCE_PIXELS = 48_000_000L
        private const val MAX_DECODE_EDGE = 2048
        private const val MAX_IMAGE_BYTES = 4096L
        private const val THRESHOLD = 145
    }
}

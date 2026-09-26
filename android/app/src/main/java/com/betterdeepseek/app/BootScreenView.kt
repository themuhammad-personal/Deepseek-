package com.betterdeepseek.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import android.os.SystemClock
import android.view.View
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * The branded launch screen, drawn on one Canvas.
 *
 * Scene: a deep night-sky gradient with four drifting aurora lights and a slow
 * star field; the app icon starts where the system splash left it (screen
 * centre), glides up into place inside a rotating gradient ring, the wordmark
 * builds letter by letter in a flowing gradient, and a slim progress bar eases
 * forward while the page loads. [finish] completes the bar and plays the exit
 * (zoom + fade), then [onExitFinished] fires.
 *
 * Time comes from [SystemClock], not ValueAnimator, so the animation still plays
 * when the system "animator duration scale" is set to 0.
 */
@SuppressLint("ViewConstructor")
internal class BootScreenView(
    context: Context,
    private val title: String,
    brandTypeface: Typeface?,
    icon: Bitmap?,
) : View(context) {

    /** Runs once on the UI thread after the exit animation has fully played. */
    var onExitFinished: (() -> Unit)? = null

    /** True once [finish] was called (the exit may still be playing). */
    val isFinishing: Boolean get() = finishAt >= 0f

    private val dp = resources.displayMetrics.density
    private var startMs = -1L
    private var finishAt = -1f
    private var exitReported = false

    // ── Paints and shaders (allocated once) ──
    private val bgPaint = Paint()
    private val blobPaint = Paint()
    private val blobShaders = Array(BLOBS.size) { i ->
        val c = BLOBS[i].color
        RadialGradient(
            0f, 0f, UNIT_RADIUS,
            intArrayOf(withAlpha(c, 0.40f), withAlpha(c, 0.18f), withAlpha(c, 0f)),
            floatArrayOf(0f, 0.45f, 1f),
            Shader.TileMode.CLAMP,
        )
    }
    private val starPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = RadialGradient(
            0f, 0f, UNIT_RADIUS,
            intArrayOf(withAlpha(BLUE, 0.55f), withAlpha(VIOLET, 0.18f), withAlpha(VIOLET, 0f)),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
    }
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f * dp
        color = Color.WHITE
    }
    private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f * dp
        strokeCap = Paint.Cap.ROUND
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val iconShader: BitmapShader? =
        icon?.let { BitmapShader(it, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
    private val iconBitmapSize = icon?.width?.toFloat() ?: 1f
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = brandTypeface ?: Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        setShadowLayer(12f * dp, 0f, 0f, withAlpha(VIOLET, 0.55f))
    }
    private val shinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = textPaint.typeface
        shader = LinearGradient(
            -40f * dp, 0f, 40f * dp, 0f,
            intArrayOf(0x00FFFFFF, 0xBFFFFFFF.toInt(), 0x00FFFFFF),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
    }
    private val barTrackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x1AFFFFFF }
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private val m = Matrix()
    private val rect = RectF()
    private var arcShader: SweepGradient? = null
    private var arcShaderFraction = -1f

    // ── Layout (computed in onSizeChanged) ──
    private var textShader: LinearGradient? = null
    private var textWidth = 0f
    private var letterX = FloatArray(0)
    private var starX = FloatArray(0)
    private var starY = FloatArray(0)
    private var starR = FloatArray(0)
    private var starSpeed = FloatArray(0)
    private var starPhase = FloatArray(0)
    private var starTwinkle = FloatArray(0)

    init {
        // Deterministic star field (same sky every launch, no Random allocation).
        var seed = 7L
        fun rnd(): Float {
            seed = (seed * 16807L) % 2147483647L
            return seed / 2147483647f
        }
        starX = FloatArray(STAR_COUNT)
        starY = FloatArray(STAR_COUNT)
        starR = FloatArray(STAR_COUNT)
        starSpeed = FloatArray(STAR_COUNT)
        starPhase = FloatArray(STAR_COUNT)
        starTwinkle = FloatArray(STAR_COUNT)
        for (i in 0 until STAR_COUNT) {
            starX[i] = rnd(); starY[i] = rnd()
            starR[i] = 0.5f + rnd() * 1.2f
            starSpeed[i] = 3f + rnd() * 9f
            starPhase[i] = rnd() * 6.28f
            starTwinkle[i] = 0.6f + rnd() * 1.6f
        }
    }

    /**
     * Completes the progress bar and plays the exit. Safe to call repeatedly.
     * The exit never starts before the intro has finished building the wordmark.
     */
    fun finish() {
        if (finishAt >= 0f) return
        finishAt = max(elapsed(), MIN_INTRO_S)
        postInvalidateOnAnimation()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        postInvalidateOnAnimation()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h.toFloat(), BG_TOP, BG_BOTTOM, Shader.TileMode.CLAMP,
        )
        // Wordmark: 34dp, shrunk to fit 80% of the width on narrow screens.
        textPaint.textSize = 34f * dp
        var tw = textPaint.measureText(title)
        val maxW = w * 0.8f
        if (tw > maxW && tw > 0f) {
            textPaint.textSize = textPaint.textSize * maxW / tw
            tw = textPaint.measureText(title)
        }
        shinePaint.textSize = textPaint.textSize
        textWidth = tw
        // Kerning-aware x offset of every glyph.
        letterX = FloatArray(title.length) { i -> textPaint.measureText(title, 0, i) }
        textShader = LinearGradient(
            0f, 0f, max(1f, tw * 2f), 0f,
            intArrayOf(CYAN, BLUE, VIOLET, MAGENTA, CYAN),
            floatArrayOf(0f, 0.25f, 0.5f, 0.75f, 1f),
            Shader.TileMode.REPEAT,
        )
        textPaint.shader = textShader
        val barHalf = BAR_W_DP * dp / 2f
        barPaint.shader = LinearGradient(
            w / 2f - barHalf, 0f, w / 2f + barHalf, 0f,
            intArrayOf(CYAN, VIOLET, MAGENTA),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    private fun elapsed(): Float =
        if (startMs < 0L) 0f else (SystemClock.uptimeMillis() - startMs) / 1000f

    override fun onDraw(canvas: Canvas) {
        // The clock starts on the first frame the user can actually see.
        if (startMs < 0L) startMs = SystemClock.uptimeMillis()
        val t = elapsed()
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        // Exit progress: bar fills to 100%, then zoom + fade.
        val ex = if (finishAt < 0f) 0f else seg(t, finishAt + BAR_FILL_S, finishAt + BAR_FILL_S + EXIT_S)
        val exE = easeInOut(ex)
        alpha = 1f - exE

        val intro = seg(t, 0f, 0.7f)

        // Background + aurora + stars
        canvas.drawRect(0f, 0f, w, h, bgPaint)
        blobPaint.alpha = (255 * intro).toInt()
        for (i in BLOBS.indices) {
            val b = BLOBS[i]
            val x = (b.x + sin(t * b.speed + b.phase) * b.ampX) * w
            val y = b.y * h + cos(t * b.speed * 0.8f + b.phase) * b.ampY * h
            val r = b.radius * w * (1f + 0.06f * sin(t * 0.7f + b.phase))
            m.setScale(r / UNIT_RADIUS, r / UNIT_RADIUS)
            m.postTranslate(x, y)
            blobShaders[i].setLocalMatrix(m)
            blobPaint.shader = blobShaders[i]
            canvas.drawRect(0f, 0f, w, h, blobPaint)
        }
        for (i in 0 until STAR_COUNT) {
            val y = (((starY[i] * h - t * starSpeed[i] * dp) % h) + h) % h
            val a = (0.25f + 0.55f * (0.5f + 0.5f * sin(t * starTwinkle[i] + starPhase[i]))) * intro
            starPaint.alpha = (255 * a).toInt()
            canvas.drawCircle(starX[i] * w, y, starR[i] * dp, starPaint)
        }

        // Foreground group: icon rises from the splash position into place.
        val cx = w / 2f
        val targetY = h * 0.5f - 64f * dp
        val rise = easeInOut(seg(t, 0.35f, 1.25f))
        val bob = sin(t * 1.7f) * 2.5f * dp * seg(t, 1.2f, 1.8f)
        val cy = h / 2f + (targetY - h / 2f) * rise + bob

        canvas.save()
        val zoom = 1f + 0.05f * exE
        canvas.scale(zoom, zoom, cx, h / 2f)

        // Halo
        val halo = (0.55f + 0.2f * sin(t * 2.2f)) * seg(t, 0.2f, 0.9f)
        if (halo > 0f) {
            val hr = 130f * dp
            m.setScale(hr / UNIT_RADIUS, hr / UNIT_RADIUS)
            m.postTranslate(cx, cy)
            haloPaint.shader.setLocalMatrix(m)
            haloPaint.alpha = (255 * min(1f, halo)).toInt()
            canvas.drawRect(cx - hr, cy - hr, cx + hr, cy + hr, haloPaint)
        }

        // Ring: faint track + rotating gradient arc with a bright head.
        val ringA = seg(t, 0.45f, 1.0f)
        if (ringA > 0f) {
            val ringR = (74f + 26f * exE) * dp
            rect.set(cx - ringR, cy - ringR, cx + ringR, cy + ringR)
            trackPaint.alpha = (255 * 0.07f * ringA).toInt()
            canvas.drawCircle(cx, cy, ringR, trackPaint)

            val rot = (t * 2f * PI.toFloat() / RING_PERIOD_S)
            val sweep = (60f + 200f * easeOut(ringA)) * PI.toFloat() / 180f
            val fraction = sweep / (2f * PI.toFloat())
            val shader = arcShaderFor(fraction)
            val startDeg = Math.toDegrees((rot - sweep).toDouble()).toFloat()
            m.setRotate(startDeg)
            m.postTranslate(cx, cy)
            shader.setLocalMatrix(m)
            arcPaint.shader = shader
            arcPaint.alpha = (255 * ringA).toInt()
            canvas.drawArc(rect, startDeg, Math.toDegrees(sweep.toDouble()).toFloat(), false, arcPaint)

            dotPaint.alpha = (255 * 0.95f * ringA).toInt()
            canvas.drawCircle(cx + cos(rot) * ringR, cy + sin(rot) * ringR, 2.6f * dp, dotPaint)
        }

        // Icon (rounded-tile clip removes the square corners of the source art).
        val shader = iconShader
        if (shader != null) {
            val size = ICON_DP * dp * (0.8f + 0.2f * easeBack(seg(t, 0f, 0.6f)))
            val left = cx - size / 2f
            val top = cy - size / 2f
            m.setScale(size / iconBitmapSize, size / iconBitmapSize)
            m.postTranslate(left, top)
            shader.setLocalMatrix(m)
            iconPaint.shader = shader
            iconPaint.alpha = (255 * seg(t, 0f, 0.25f)).toInt()
            val inset = size * ICON_TILE_INSET
            val radius = size * ICON_TILE_RADIUS
            rect.set(left + inset, top + inset, left + size - inset, top + size - inset)
            canvas.drawRoundRect(rect, radius, radius, iconPaint)
        }

        // Wordmark: glyphs rise in one by one, gradient flows continuously.
        val size = textPaint.textSize
        val baseY = cy + (74f + 26f + 34f) * dp + size * 0.35f
        val textLeft = cx - textWidth / 2f
        textShader?.let {
            val shift = (t * 60f * dp) % max(1f, textWidth * 2f)
            m.setTranslate(textLeft - shift, 0f)
            it.setLocalMatrix(m)
        }
        for (i in title.indices) {
            val k = seg(t, LETTER_START_S + i * LETTER_STAGGER_S, LETTER_START_S + i * LETTER_STAGGER_S + LETTER_DUR_S)
            if (k <= 0f) continue
            val e = easeBack(k)
            val x = textLeft + letterX[i]
            val half = textPaint.measureText(title, i, i + 1) / 2f
            canvas.save()
            canvas.translate(0f, (1f - e) * 16f * dp)
            val s = 0.86f + 0.14f * e
            canvas.scale(s, s, x + half, baseY)
            textPaint.alpha = (255 * min(1f, k * 1.6f)).toInt()
            canvas.drawText(title, i, i + 1, x, baseY, textPaint)
            canvas.restore()
        }

        // Light sweep across the finished wordmark every few seconds.
        val revealEnd = LETTER_START_S + title.length * LETTER_STAGGER_S + LETTER_DUR_S
        if (t > revealEnd + 0.3f) {
            val sp = ((t - revealEnd - 0.3f) % SHINE_PERIOD_S) / SHINE_DUR_S
            if (sp < 1f) {
                val sx = textLeft - 60f * dp + (textWidth + 120f * dp) * easeInOut(sp)
                m.setTranslate(sx, 0f)
                shinePaint.shader.setLocalMatrix(m)
                canvas.drawText(title, textLeft, baseY, shinePaint)
            }
        }

        // Progress bar: eases toward 90% while loading, fills on finish.
        val barA = seg(t, 1.3f, 1.8f)
        if (barA > 0f) {
            val barW = BAR_W_DP * dp
            val barH = 3f * dp
            val barY = baseY + 30f * dp
            var p = loadingProgress(t)
            if (finishAt >= 0f) {
                val p0 = loadingProgress(finishAt)
                p = p0 + (1f - p0) * easeOut(seg(t, finishAt, finishAt + BAR_FILL_S))
            }
            barTrackPaint.alpha = (255 * 0.10f * barA).toInt()
            rect.set(cx - barW / 2f, barY, cx + barW / 2f, barY + barH)
            canvas.drawRoundRect(rect, barH / 2f, barH / 2f, barTrackPaint)
            barPaint.alpha = (255 * barA).toInt()
            rect.set(cx - barW / 2f, barY, cx - barW / 2f + max(barH, barW * p), barY + barH)
            canvas.drawRoundRect(rect, barH / 2f, barH / 2f, barPaint)
        }
        canvas.restore()

        if (ex >= 1f) {
            if (!exitReported) {
                exitReported = true
                post { onExitFinished?.invoke() }
            }
        } else {
            postInvalidateOnAnimation()
        }
    }

    private fun arcShaderFor(fraction: Float): SweepGradient {
        val cached = arcShader
        if (cached != null && kotlin.math.abs(fraction - arcShaderFraction) < 0.004f) return cached
        val f = fraction.coerceIn(0.05f, 0.95f)
        val s = SweepGradient(
            0f, 0f,
            intArrayOf(withAlpha(CYAN, 0f), withAlpha(CYAN, 0.9f), VIOLET, MAGENTA, withAlpha(MAGENTA, 0f), withAlpha(MAGENTA, 0f)),
            floatArrayOf(0f, f * 0.45f, f * 0.8f, f, f + 0.002f, 1f),
        )
        arcShader = s
        arcShaderFraction = fraction
        return s
    }

    private class Blob(
        val color: Int, val radius: Float, val x: Float, val y: Float,
        val ampX: Float, val ampY: Float, val speed: Float, val phase: Float,
    )

    private companion object {
        const val UNIT_RADIUS = 100f
        const val STAR_COUNT = 54
        const val ICON_DP = 104f
        /** Rounded tile inside the icon art, as fractions of the icon size. */
        const val ICON_TILE_INSET = 0.058f
        const val ICON_TILE_RADIUS = 0.212f
        const val RING_PERIOD_S = 1.6f
        const val LETTER_START_S = 0.75f
        const val LETTER_STAGGER_S = 0.045f
        const val LETTER_DUR_S = 0.55f
        const val SHINE_PERIOD_S = 3.2f
        const val SHINE_DUR_S = 1.1f
        const val BAR_W_DP = 132f
        const val BAR_FILL_S = 0.38f
        const val EXIT_S = 0.55f
        /** The exit never starts before the wordmark has fully built. */
        const val MIN_INTRO_S = 2.2f

        const val BG_TOP = 0xFF070A1C.toInt()
        const val BG_BOTTOM = 0xFF0D1133.toInt()
        const val CYAN = 0xFF22D3EE.toInt()
        const val BLUE = 0xFF4D6BFE.toInt()
        const val VIOLET = 0xFF8B5CF6.toInt()
        const val MAGENTA = 0xFFEC4899.toInt()

        val BLOBS = arrayOf(
            Blob(BLUE, 0.95f, 0.22f, 0.30f, 0.16f, 0.11f, 0.45f, 0f),
            Blob(VIOLET, 0.85f, 0.82f, 0.44f, 0.14f, 0.13f, 0.37f, 1.7f),
            Blob(CYAN, 0.70f, 0.30f, 0.72f, 0.15f, 0.10f, 0.52f, 3.1f),
            Blob(MAGENTA, 0.65f, 0.78f, 0.80f, 0.13f, 0.12f, 0.41f, 4.4f),
        )

        fun withAlpha(color: Int, a: Float): Int =
            (color and 0x00FFFFFF) or ((255 * a.coerceIn(0f, 1f)).toInt() shl 24)

        fun seg(t: Float, a: Float, b: Float): Float = ((t - a) / (b - a)).coerceIn(0f, 1f)
        fun easeOut(x: Float): Float = 1f - (1f - x).pow(3)
        fun easeInOut(x: Float): Float =
            if (x < 0.5f) 4f * x * x * x else 1f - (-2f * x + 2f).pow(3) / 2f
        fun easeBack(x: Float): Float {
            val c1 = 1.55f
            val c3 = c1 + 1f
            return 1f + c3 * (x - 1f).pow(3) + c1 * (x - 1f).pow(2)
        }

        /** Asymptotic "honest" progress: fast at first, never reaches 100% alone. */
        fun loadingProgress(t: Float): Float =
            if (t < 0.9f) 0f else 0.9f * (1f - exp(-(t - 0.9f) / 4f))
    }
}

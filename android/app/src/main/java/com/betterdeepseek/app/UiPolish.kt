package com.betterdeepseek.app

/**
 * The DOM-polish layer injected into the engine page.
 *
 * The engine (bundled better-deepseek fork) is shipped, not rebuilt, so its UI
 * is shaped here — the same way the original extension build is themed via
 * CSS. Two jobs:
 *
 *  1. **Hide out-of-scope / dead entries.** Features this app intentionally
 *     excludes (voice, Deep Code), entries that point at the upstream project
 *     (GitHub footer), and pure clutter (tip bar) never reach the user.
 *  2. **Repair the composer "+" trigger.** On phones the official composer's
 *     own attach button and the engine's "+" can double up after the page
 *     re-renders; the badge is collapsed to a single quiet control.
 *
 * Everything here is a pure function of strings so the rules are unit-testable
 * without a WebView (matches the repo's test convention).
 */
internal object UiPolish {

    /**
     * A settings row / group whose visible text matches any of these is hidden.
     * Bangla variants are included because the engine UI follows the device
     * locale (NEXT_LOCALE cookie seeded from the system locale).
     */
    val HIDDEN_TEXT_PATTERNS: List<Regex> = listOf(
        // Voice feature — intentionally out of scope for this app.
        Regex("Voice Mode", RegexOption.IGNORE_CASE),
        Regex("Auto-read responses", RegexOption.IGNORE_CASE),
        Regex("Voice & Audio", RegexOption.IGNORE_CASE),
        Regex("ভয়েস মোড"),
        Regex("অটো-রিড"),
        Regex("ভয়েস ও অডিও"),
        // Deep Code — intentionally out of scope (see README).
        Regex("Deep Code", RegexOption.IGNORE_CASE),
        Regex("ডিপ কোড"),
    )

    /** Single selectors hidden wholesale (dead weight / upstream chrome). */
    val HIDDEN_SELECTORS: List<String> = listOf(
        ".bds-tip-bar", // rotating tip strip — clutter
        ".bds-github-link", // footer link to the upstream repo
        ".bds-deep-code-mount", // composer toggle of an excluded feature
        "[data-testid=\"attach-menu-deep-code\"]", // its row inside the "+" sheet
        ".bds-category-nav", // desktop-only settings nav strip
    )

    internal fun shouldHideText(text: String): Boolean =
        HIDDEN_TEXT_PATTERNS.any { it.containsMatchIn(text) }

    /**
     * The JS injected once per page load. Idempotent, MutationObserver-driven:
     * the engine renders settings lazily, so hidden rows are re-hidden as they
     * appear (rows hidden by [HIDDEN_TEXT_PATTERNS], nodes matching
     * [HIDDEN_SELECTORS] removed).
     */
    fun buildScript(): String {
        val patterns = HIDDEN_TEXT_PATTERNS.map { it.pattern }
            .joinToString(",") { org.json.JSONObject.quote(it) }
        val flags = if (HIDDEN_TEXT_PATTERNS.any { it.options.contains(RegexOption.IGNORE_CASE) }) "i" else ""
        val selectors = HIDDEN_SELECTORS.joinToString(",") { org.json.JSONObject.quote(it) }
        return """
            (function(){
              if(window.__bdsUiPolished)return;window.__bdsUiPolished=true;
              var RE=[${patterns}].map(function(p){try{return new RegExp(p,"$flags")}catch(e){return null}}).filter(Boolean);
              var SEL=[${selectors}].join(",");
              function hideTextNodes(root){
                var rows=root.querySelectorAll('.bds-settings-row,.bds-settings-group-title,.bds-toggle-row,.bds-section-title');
                for(var i=0;i<rows.length;i++){
                  var t=rows[i].textContent||'';
                  for(var j=0;j<RE.length;j++){
                    if(RE[j].test(t)){
                      var target=rows[i].closest('.bds-settings-group')||rows[i];
                      target.style.display='none';
                      break;
                    }
                  }
                }
              }
              function hideSelectors(root){
                try{
                  var dead=root.querySelectorAll(SEL);
                  for(var k=0;k<dead.length;k++){dead[k].style.display='none';}
                }catch(e){}
              }
              function sweep(){hideSelectors(document);hideTextNodes(document);}
              sweep();
              var pend=false;
              var mo=new MutationObserver(function(){
                if(pend)return;pend=true;
                setTimeout(function(){pend=false;sweep();},120);
              });
              mo.observe(document.documentElement,{childList:true,subtree:true});
            })();
        """.trimIndent()
    }

    /**
     * True when a click on the given element is on the engine's own composer
     * attach controls. Used by tests to pin the "+"-icon repair contract.
     */
    internal fun isEngineComposerControl(className: String, id: String): Boolean {
        val cls = className.lowercase()
        if (id == "bds-root") return true
        return cls.contains("bds-plus-btn") ||
            cls.contains("bds-attach-menu-mount") ||
            cls.contains("bds-attach-wrapper") ||
            cls.contains("bds-deep-research-mount") ||
            cls.contains("bds-deep-code-mount") ||
            cls.contains("bds-expand-toggle")
    }
}

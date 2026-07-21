<?php
/**
 * Chat page — embedded inside a Moodle course via a link or block.
 * URL: /local/eduai/ask.php?courseid=<id>
 */

require_once(__DIR__ . '/../../config.php');
require_login();

$courseId = required_param('courseid', PARAM_INT);
$course   = $DB->get_record('course', ['id' => $courseId], '*', MUST_EXIST);

require_course_login($course);

$PAGE->set_url('/local/eduai/ask.php', ['courseid' => $courseId]);
$PAGE->set_context(context_course::instance($courseId));
$PAGE->set_title($course->fullname . ' — AI Assistant');
$PAGE->set_heading($course->fullname);
$PAGE->set_pagelayout('course');

$api = new \local_eduai\api();

echo $OUTPUT->header();

if (!$api->is_configured()) {
    echo $OUTPUT->notification(get_string('error_config', 'local_eduai'), 'error');
    echo $OUTPUT->footer();
    exit;
}

// Handle form submission (progressive enhancement — works without JS too)
$answer  = null;
$sources = [];
$question = optional_param('q', '', PARAM_TEXT);

if ($question !== '' && confirm_sesskey()) {
    try {
        $lang   = current_language();
        $result = $api->ask($question, $courseId, $lang);
        $answer  = $result['answer']  ?? get_string('no_answer', 'local_eduai');
        $sources = $result['sources'] ?? [];
    } catch (\Throwable $e) {
        $answer = get_string('no_answer', 'local_eduai');
    }
}

?>
<style>
#eduai-wrap { max-width:720px; margin:0 auto; font-family:inherit; }
#eduai-form { display:flex; gap:8px; margin-bottom:16px; }
#eduai-input { flex:1; padding:10px 14px; border:1px solid #ccc; border-radius:8px; font-size:14px; }
#eduai-btn { padding:10px 20px; background:#0d6efd; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px; }
#eduai-btn:hover { background:#0b5ed7; }
.eduai-answer { background:#f0f7ff; border-left:4px solid #0d6efd; padding:16px; border-radius:8px; white-space:pre-wrap; line-height:1.6; }
.eduai-sources { margin-top:12px; font-size:12px; color:#666; }
.eduai-source { display:inline-block; margin:2px 4px 2px 0; padding:2px 8px; background:#e9ecef; border-radius:4px; }
</style>

<div id="eduai-wrap">
    <h3><?php echo get_string('pluginname', 'local_eduai'); ?></h3>
    <form id="eduai-form" method="post" action="<?php echo $PAGE->url; ?>">
        <input type="hidden" name="sesskey" value="<?php echo sesskey(); ?>">
        <input type="hidden" name="courseid" value="<?php echo $courseId; ?>">
        <input id="eduai-input" type="text" name="q"
               placeholder="<?php echo get_string('ask_placeholder', 'local_eduai'); ?>"
               value="<?php echo s($question); ?>" autocomplete="off">
        <button id="eduai-btn" type="submit"><?php echo get_string('ask_button', 'local_eduai'); ?></button>
    </form>

    <?php if ($answer !== null): ?>
    <div class="eduai-answer"><?php echo format_text($answer, FORMAT_MARKDOWN); ?></div>
    <?php if (!empty($sources)): ?>
    <div class="eduai-sources">
        <?php foreach ($sources as $s): ?>
        <span class="eduai-source"><?php echo s($s['document']); ?> · p.<?php echo (int)$s['page']; ?></span>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
    <?php endif; ?>
</div>

<script>
// Progressive enhancement — AJAX so page doesn't reload
(function() {
    const form  = document.getElementById('eduai-form');
    const input = document.getElementById('eduai-input');
    const btn   = document.getElementById('eduai-btn');
    const wrap  = document.getElementById('eduai-wrap');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        btn.disabled = true;
        btn.textContent = '...';

        // Remove previous answer
        wrap.querySelectorAll('.eduai-answer,.eduai-sources').forEach(el => el.remove());

        const fd = new FormData(form);
        const resp = await fetch(form.action, { method:'POST', body: fd });
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('.eduai-answer,.eduai-sources').forEach(el => wrap.appendChild(el));

        btn.disabled = false;
        btn.textContent = <?php echo json_encode(get_string('ask_button', 'local_eduai')); ?>;
    });
})();
</script>

<?php echo $OUTPUT->footer(); ?>

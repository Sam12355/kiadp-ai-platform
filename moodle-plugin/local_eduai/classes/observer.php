<?php
namespace local_eduai;

defined('MOODLE_INTERNAL') || die();

/**
 * Listens for Moodle course module events and syncs resource files to EduAI.
 * Only processes modules of type 'resource' (teacher-uploaded files).
 */
class observer {

    public static function resource_created(\core\event\course_module_created $event): void {
        if ($event->other['modulename'] !== 'resource') return;
        self::sync_resource($event->contextinstanceid, $event->courseid, 'create');
    }

    public static function resource_updated(\core\event\course_module_updated $event): void {
        if ($event->other['modulename'] !== 'resource') return;
        self::sync_resource($event->contextinstanceid, $event->courseid, 'update');
    }

    public static function resource_deleted(\core\event\course_module_deleted $event): void {
        if ($event->other['modulename'] !== 'resource') return;
        $api = new api();
        if (!$api->is_configured()) return;
        try {
            $api->delete_resource($event->courseid, $event->contextinstanceid);
        } catch (\Throwable $e) {
            debugging('EduAI: failed to delete resource ' . $e->getMessage(), DEBUG_DEVELOPER);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    private static function sync_resource(int $cmid, int $courseId, string $action): void {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/mod/resource/lib.php');

        $api = new api();
        if (!$api->is_configured()) return;

        // Load the course module and its stored file
        $cm      = get_coursemodule_from_id('resource', $cmid, $courseId, false, MUST_EXIST);
        $course  = $DB->get_record('course', ['id' => $courseId], '*', MUST_EXIST);
        $context = \context_module::instance($cmid);

        $fs    = get_file_storage();
        $files = $fs->get_area_files($context->id, 'mod_resource', 'content', false, 'sortorder DESC', false);
        if (empty($files)) return;

        $file = reset($files); // first (main) file

        // Only ingest PDFs and common document types — skip images/videos
        $allowed = ['application/pdf', 'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain'];
        if (!in_array($file->get_mimetype(), $allowed)) return;

        // Copy to a temp path so we can POST it
        $tmpPath = make_temp_directory('local_eduai') . '/' . $file->get_filename();
        $file->copy_content_to($tmpPath);

        try {
            $api->ingest_file(
                $tmpPath,
                $file->get_filename(),
                $file->get_mimetype(),
                $cm->name,
                $courseId,
                $course->fullname,
                $cmid
            );
            debugging('EduAI: synced resource "' . $cm->name . '" (' . $action . ')', DEBUG_DEVELOPER);
        } catch (\Throwable $e) {
            debugging('EduAI: sync failed — ' . $e->getMessage(), DEBUG_DEVELOPER);
        } finally {
            @unlink($tmpPath);
        }
    }
}

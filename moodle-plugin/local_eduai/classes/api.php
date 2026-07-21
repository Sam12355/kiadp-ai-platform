<?php
namespace local_eduai;

defined('MOODLE_INTERNAL') || die();

/**
 * HTTP client for the EduAI backend API.
 */
class api {

    /** @var string */
    private string $baseUrl;
    /** @var string */
    private string $apiKey;

    public function __construct() {
        $this->baseUrl = rtrim(get_config('local_eduai', 'apiurl'), '/');
        $this->apiKey  = get_config('local_eduai', 'apikey');
    }

    public function is_configured(): bool {
        return !empty($this->baseUrl) && !empty($this->apiKey);
    }

    /**
     * Send a file to /moodle/ingest.
     *
     * @param string $filePath  Local filesystem path to the file.
     * @param string $fileName  Original filename.
     * @param string $mimeType  MIME type (e.g. application/pdf).
     * @param string $title     Document title.
     * @param int    $courseId  Moodle course ID.
     * @param string $courseName Course fullname.
     * @param int    $resourceId Moodle course module ID (cmid).
     * @return array{documentId:string, status:string}
     */
    public function ingest_file(
        string $filePath,
        string $fileName,
        string $mimeType,
        string $title,
        int $courseId,
        string $courseName,
        int $resourceId
    ): array {
        $curl = new \curl();
        $curl->setHeader(['Authorization: Bearer ' . $this->apiKey]);

        $response = $curl->post($this->baseUrl . '/api/moodle/ingest', [
            'file'       => curl_file_create($filePath, $mimeType, $fileName),
            'title'      => $title,
            'courseId'   => (string)$courseId,
            'courseName' => $courseName,
            'resourceId' => (string)$resourceId,
        ]);

        $decoded = json_decode($response, true);
        if (!$decoded || !($decoded['success'] ?? false)) {
            throw new \moodle_exception('sync_failed', 'local_eduai', '', $response);
        }
        return $decoded['data'];
    }

    /**
     * Delete a document from the knowledge base.
     */
    public function delete_resource(int $courseId, int $resourceId): void {
        $curl = new \curl();
        $curl->setHeader(['Authorization: Bearer ' . $this->apiKey]);
        $curl->delete($this->baseUrl . '/api/moodle/ingest/' . $courseId . '/' . $resourceId);
    }

    /**
     * Ask a question scoped to a specific course.
     *
     * @param string $question
     * @param int    $courseId
     * @param string $language  'en'|'si'|'ta'|'ar'
     * @return array{answer:string, isGrounded:bool, sources:array}
     */
    public function ask(string $question, int $courseId, string $language = 'en'): array {
        $curl = new \curl();
        $curl->setHeader([
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
        ]);

        $response = $curl->post(
            $this->baseUrl . '/api/moodle/ask',
            json_encode(['question' => $question, 'courseId' => (string)$courseId, 'language' => $language])
        );

        $decoded = json_decode($response, true);
        if (!$decoded) {
            throw new \moodle_exception('error_config', 'local_eduai');
        }
        return $decoded;
    }
}

<?php
// Event observers — fired when teachers add/update/delete course resources.
defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname'   => '\core\event\course_module_created',
        'callback'    => '\local_eduai\observer::resource_created',
        'includefile' => null,
        'internal'    => false,
        'priority'    => 0,
    ],
    [
        'eventname'   => '\core\event\course_module_updated',
        'callback'    => '\local_eduai\observer::resource_updated',
        'includefile' => null,
        'internal'    => false,
        'priority'    => 0,
    ],
    [
        'eventname'   => '\core\event\course_module_deleted',
        'callback'    => '\local_eduai\observer::resource_deleted',
        'includefile' => null,
        'internal'    => false,
        'priority'    => 0,
    ],
];

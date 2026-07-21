<?php
defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_eduai', get_string('pluginname', 'local_eduai'));
    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configtext(
        'local_eduai/apiurl',
        get_string('apiurl', 'local_eduai'),
        get_string('apiurl_desc', 'local_eduai'),
        'https://api.yourschool.com',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_eduai/apikey',
        get_string('apikey', 'local_eduai'),
        get_string('apikey_desc', 'local_eduai'),
        ''
    ));
}

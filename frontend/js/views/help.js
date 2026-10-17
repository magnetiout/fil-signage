import { renderHTML, uiText } from '../lib/i18n-bindings.js';

import { message as t } from '../i18n.js';

// The public how-to for the three cards that link to it (frontend/guides/).
const WLT_GUIDE = '/guides/digital-signage-widgets-layouts-transitions.html';

// In-panel guides and FAQ use the same keyed admin language bindings.
export function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><h1>${renderHTML(t('help.title'))}</h1><div class="subtitle">${renderHTML(t('help.subtitle'))}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:32px">
      ${renderHTML([
        { icon: '&#128250;', title: t("ui.help.setting_up_a_display_873a29"), steps: [t("ui.help.download_the_apk_or_open_the_web_player_edc0d7"), t("ui.help.enter_your_server_url_2a350c"), t("ui.help.note_the_6_digit_pairing_code_312d6d"), t("ui.help.click_add_display_in_the_dashboard_and_enter_the_code_41d96b"), t("ui.help.assign_content_to_the_display_s_playlist_845b8e")] },
        { icon: '&#128228;', title: t("ui.help.uploading_content_e04671"), steps: [t("ui.help.go_to_content_library_3f5f2d"), t("ui.help.drag_and_drop_files_or_click_the_upload_area_e3ac8a"), t("ui.help.supports_mp4_webm_jpeg_png_gif_webp_ec8269"), t("ui.help.videos_auto_detect_duration_and_generate_thumbnails_7fbdf0"), t("ui.help.use_remote_url_to_stream_from_external_sources_abf0a3")] },
        { icon: '&#9881;', title: t("ui.help.using_widgets_191ca6"), steps: [t("ui.help.go_to_widgets_and_click_new_widget_c329bc"), t("ui.help.choose_a_type_clock_weather_news_ticker_text_html_webpa_813327"), t("ui.help.configure_the_widget_settings_and_save_729339"), t("ui.help.add_it_to_a_playlist_add_content_widgets_tab_and_set_it_140972"), t("ui.help.publish_the_playlist_df5a11")], link: WLT_GUIDE },
        { icon: '&#10024;', title: t("ui.help.ai_content_design_ca364c"), steps: [t("ui.help.open_designer_and_click_the_gear_on_the_ai_generate_pan_ca54a2"), t("ui.help.add_an_openai_compatible_text_endpoint_model_openai_clo_ed486d"), t("ui.help.optional_pick_an_image_provider_for_ai_backgrounds_open_a730c4"), t("ui.help.type_a_prompt_click_generate_design_then_tweak_and_publ_dbfab5"), t("ui.help.run_it_fully_local_free_see_docs_local_ai_setup_md_1ecd5e")] },
        { icon: '&#128203;', title: t("ui.help.multi_zone_layouts_5b3dcc"), steps: [t("ui.help.go_to_layouts_and_create_a_new_layout_or_use_a_template_884a2f"), t("ui.help.drag_zones_to_position_them_on_the_canvas_1be5bd"), t("ui.help.resize_using_the_corner_handle_ae2746"), t("ui.help.pick_the_layout_in_a_playlist_s_layout_row_or_set_it_on_f4bae6"), t("ui.help.set_each_playlist_item_s_zone_each_zone_plays_its_own_i_f822e0")], link: WLT_GUIDE },
        { icon: '&#127902;', title: t("ui.help.transitions_ab3926"), steps: [t("ui.help.go_to_widgets_click_new_widget_and_choose_transition_082db1"), t("ui.help.pick_one_or_more_effects_and_a_duration_65e64c"), t("ui.help.add_it_to_the_playlist_and_set_its_zone_to_the_zone_it__fa75b1"), t("ui.help.it_only_changes_the_items_in_its_own_zone_use_one_per_z_52bac8"), t('help.zone_support')], link: WLT_GUIDE },
        { icon: '&#128197;', title: t("ui.help.content_scheduling_51db5c"), steps: [t("ui.help.go_to_schedule_and_select_a_device_4ea054"), t("ui.help.click_add_schedule_to_create_a_time_slot_118a39"), t("ui.help.set_start_end_times_and_recurrence_rules_8ded05"), t("ui.help.higher_priority_schedules_override_lower_ones_d43b81"), t("ui.help.content_auto_switches_based_on_the_schedule_f5c61a")] },
        { icon: '&#128421;', title: t("ui.help.remote_control_8f1c0b"), steps: [t("ui.help.go_to_a_device_s_detail_page_9f95f1"), t("ui.help.click_the_remote_control_tab_9f10a4"), t("ui.help.click_start_remote_to_begin_streaming_e76723"), t("ui.help.use_the_d_pad_volume_and_power_buttons_2142bd"), t("ui.help.click_anywhere_on_the_screen_to_simulate_a_tap_d96526")] },
        { icon: '&#128433;', title: t("ui.help.kiosk_touchscreen_7848a2"), steps: [t("ui.help.go_to_kiosk_and_create_a_new_page_bfe2d6"), t("ui.help.add_buttons_with_labels_icons_and_actions_6f2523"), t("ui.help.configure_the_idle_screen_timeout_1744c2"), t("ui.help.preview_the_page_in_the_editor_ce135d"), t("ui.help.assign_to_a_device_as_a_widget_b21443")] },
        { icon: '&#127916;', title: t("ui.help.video_walls_34cb91"), steps: [t("ui.help.go_to_video_walls_and_create_a_new_wall_a03a9e"), t("ui.help.drag_displays_onto_the_canvas_and_arrange_them_to_match_e881b5"), t("ui.help.panel_hung_sideways_select_it_and_set_how_this_panel_is_e3d3c8"), t("ui.help.set_bezel_compensation_if_needed_then_fit_player_to_scr_39469c"), t("ui.help.assign_a_playlist_to_play_across_all_displays_bb8c4a"), t("ui.help.the_panels_list_below_the_canvas_shows_each_screen_s_on_dd0226")] },
      ].map(guide => `
        <div class="settings-section" style="margin:0">
          <h3 style="font-size:15px">${renderHTML(guide.icon)} ${uiText(guide.title)}</h3>
          <ol style="padding-left:20px;list-style:decimal;margin-top:8px">
            ${renderHTML(guide.steps.map(s => `<li style="color:var(--text-secondary);font-size:13px;line-height:1.8">${renderHTML(s)}</li>`).join(''))}
          </ol>
          ${renderHTML(guide.link ? `<a href="${guide.link}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:13px">${renderHTML(t("ui.help.read_the_full_guide_with_screenshots_e45459"))}</a>` : '')}
        </div>
      `).join(''))}
    </div>

    <div class="settings-section">
      <h3>${renderHTML(t('help.faq'))}</h3>
      ${renderHTML([
        { q: t("ui.help.what_devices_are_supported_c6e59c"), a: t("ui.help.android_tv_tablets_apk_raspberry_pi_windows_chromeos_lg_db7064") },
        { q: t("ui.help.how_does_the_free_trial_work_4a0f2c"), a: t("ui.help.new_accounts_on_the_hosted_service_get_a_14_day_trial_o_9b301f") },
        { q: t("ui.help.can_i_use_portrait_mode_displays_b36420"), a: t("ui.help.yes_set_the_orientation_to_portrait_in_the_device_s_inf_4a6ff1") },
        { q: t("ui.help.what_happens_when_a_device_goes_offline_8f06b8"), a: t("ui.help.devices_cache_content_locally_so_they_continue_playing__5c3688") },
        { q: t("ui.help.can_i_self_host_screentinker_af0c7c"), a: t('help.self_hosting') },
        { q: t("ui.help.how_do_i_update_the_android_app_f839dc"), a: t("ui.help.the_app_checks_for_updates_automatically_every_30_minut_6a3bda") },
        { q: t("ui.help.what_video_formats_are_supported_c0dfbd"), a: t("ui.help.mp4_h_264_webm_avi_mkv_mov_for_best_compatibility_use_m_86885a") },
        { q: t("ui.help.can_i_white_label_the_dashboard_961541"), a: t('help.brand_customization') },
        { q: t("ui.help.how_do_i_export_proof_of_play_reports_c1f02f"), a: t("ui.help.go_to_reports_set_your_date_range_and_filters_then_clic_7a4da1") },
        { q: t("ui.help.what_is_a_video_wall_b5c9c3"), a: t("ui.help.a_video_wall_combines_multiple_displays_into_one_large__619b1b") },
        { q: t("ui.help.how_do_i_build_a_wall_from_portrait_sideways_mounted_pa_8ab998"), a: t("ui.help.arrange_the_tiles_on_the_wall_canvas_exactly_as_the_pan_07b12f") },
      ].map(faq => `
        <div style="border-bottom:1px solid var(--border);padding:12px 0">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${renderHTML(faq.q)}</div>
          <div style="color:var(--text-secondary);font-size:13px">${renderHTML(faq.a)}</div>
        </div>
      `).join(''))}
    </div>

    <div class="settings-section">
      <h3>${renderHTML(t('help.shortcuts'))}</h3>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13px">
        <kbd style="background:var(--bg-input);padding:2px 8px;border-radius:4px;font-family:monospace">Esc</kbd> <span style="color:var(--text-secondary)">${renderHTML(t('help.shortcut_esc'))}</span>
        <kbd style="background:var(--bg-input);padding:2px 8px;border-radius:4px;font-family:monospace">F</kbd> <span style="color:var(--text-secondary)">${renderHTML(t('help.shortcut_f'))}</span>
      </div>
    </div>
  `;
}

export function cleanup() {}

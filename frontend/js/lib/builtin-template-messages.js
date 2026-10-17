// Display metadata only. Defaults, saved content and option values are never translated.
export default {
  "lobby-welcome": {
    "version": "1.0.0",
    "author": "ScreenTinker",
    "name": {
      "key": "builtin.templates.lobby_welcome.name",
      "en": "Lobby welcome"
    },
    "description": {
      "key": "builtin.templates.lobby_welcome.description",
      "en": "A calm welcome screen for a reception or lobby: your logo, a headline and a line of detail, with a live clock and date in the building's own timezone and language."
    },
    "params": {
      "logo": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.logo.label",
          "en": "Logo"
        },
        "help": {
          "key": "builtin.templates.lobby_welcome.params.logo.help",
          "en": "A PNG or SVG with a transparent background works best. Shown top left."
        },
        "options": {}
      },
      "eyebrow": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.eyebrow.label",
          "en": "Small heading"
        },
        "options": {}
      },
      "headline": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.headline.label",
          "en": "Headline"
        },
        "options": {}
      },
      "subline": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.subline.label",
          "en": "Detail line"
        },
        "options": {}
      },
      "footer": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.footer.label",
          "en": "Footer"
        },
        "options": {}
      },
      "accent": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.accent.label",
          "en": "Accent colour"
        },
        "options": {}
      },
      "background": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.background.label",
          "en": "Background colour"
        },
        "options": {}
      },
      "text_color": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.text_color.label",
          "en": "Text colour"
        },
        "options": {}
      },
      "timezone": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.timezone.label",
          "en": "Clock timezone"
        },
        "help": {
          "key": "builtin.templates.lobby_welcome.params.timezone.help",
          "en": "Leave empty to use the screen's own clock."
        },
        "options": {}
      },
      "locale": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.locale.label",
          "en": "Date language"
        },
        "help": {
          "key": "builtin.templates.lobby_welcome.params.locale.help",
          "en": "For example en-GB, de-DE or fr-CA. Leave empty for the screen's language."
        },
        "options": {}
      },
      "clock_format": {
        "label": {
          "key": "builtin.templates.lobby_welcome.params.clock_format.label",
          "en": "Clock format"
        },
        "options": {
          "12": {
            "key": "builtin.templates.lobby_welcome.params.clock_format.options.12",
            "en": "12-hour"
          },
          "24": {
            "key": "builtin.templates.lobby_welcome.params.clock_format.options.24",
            "en": "24-hour"
          }
        }
      }
    }
  },
  "news-ticker": {
    "version": "1.0.0",
    "author": "ScreenTinker",
    "name": {
      "key": "builtin.templates.news_ticker.name",
      "en": "News ticker"
    },
    "description": {
      "key": "builtin.templates.news_ticker.description",
      "en": "Your own headlines as a rotating feature plus a smooth scrolling ticker. Full screen it shows both; placed in a thin strip zone it becomes a ticker bar on its own. Works fully offline — the headlines are typed in, nothing is fetched."
    },
    "params": {
      "title": {
        "label": {
          "key": "builtin.templates.news_ticker.params.title.label",
          "en": "Title"
        },
        "options": {}
      },
      "headlines": {
        "label": {
          "key": "builtin.templates.news_ticker.params.headlines.label",
          "en": "Headlines"
        },
        "help": {
          "key": "builtin.templates.news_ticker.params.headlines.help",
          "en": "One headline per line. Blank lines are ignored."
        },
        "options": {}
      },
      "max_items": {
        "label": {
          "key": "builtin.templates.news_ticker.params.max_items.label",
          "en": "Show at most"
        },
        "help": {
          "key": "builtin.templates.news_ticker.params.max_items.help",
          "en": "Headlines beyond this number are not shown."
        },
        "options": {}
      },
      "speed": {
        "label": {
          "key": "builtin.templates.news_ticker.params.speed.label",
          "en": "Ticker speed"
        },
        "help": {
          "key": "builtin.templates.news_ticker.params.speed.help",
          "en": "Pixels per second on a 1080-pixel-high screen. Scales with the screen."
        },
        "options": {}
      },
      "rotate_seconds": {
        "label": {
          "key": "builtin.templates.news_ticker.params.rotate_seconds.label",
          "en": "Seconds per featured headline"
        },
        "options": {}
      },
      "accent": {
        "label": {
          "key": "builtin.templates.news_ticker.params.accent.label",
          "en": "Accent colour"
        },
        "options": {}
      },
      "background": {
        "label": {
          "key": "builtin.templates.news_ticker.params.background.label",
          "en": "Background colour"
        },
        "options": {}
      },
      "text_color": {
        "label": {
          "key": "builtin.templates.news_ticker.params.text_color.label",
          "en": "Text colour"
        },
        "options": {}
      },
      "show_clock": {
        "label": {
          "key": "builtin.templates.news_ticker.params.show_clock.label",
          "en": "Show the clock"
        },
        "options": {}
      },
      "timezone": {
        "label": {
          "key": "builtin.templates.news_ticker.params.timezone.label",
          "en": "Clock timezone"
        },
        "help": {
          "key": "builtin.templates.news_ticker.params.timezone.help",
          "en": "Leave empty to use the screen's own clock."
        },
        "options": {}
      },
      "locale": {
        "label": {
          "key": "builtin.templates.news_ticker.params.locale.label",
          "en": "Clock language"
        },
        "help": {
          "key": "builtin.templates.news_ticker.params.locale.help",
          "en": "For example en-GB. Leave empty for the screen's language."
        },
        "options": {}
      }
    }
  },
  "uptime-3036": {
    "version": "1.0.1",
    "author": "ScreenTinker",
    "name": {
      "key": "builtin.templates.uptime_3036.name",
      "en": "UPTIME 3036"
    },
    "description": {
      "key": "builtin.templates.uptime_3036.description",
      "en": "An original first-person arcade shooter about the worst on-call shift of the year 3036: every server is down and the datacenter is crawling with bugs. Nobody playing? It plays itself in autopilot demo mode. Click or press a key to take over; walk away and the demo takes back over."
    },
    "params": {
      "title": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.title.label",
          "en": "Title"
        },
        "options": {}
      },
      "tagline": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.tagline.label",
          "en": "Tagline"
        },
        "options": {}
      },
      "accent": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.accent.label",
          "en": "Neon colour"
        },
        "options": {}
      },
      "accent2": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.accent2.label",
          "en": "Second neon colour"
        },
        "options": {}
      },
      "difficulty": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.difficulty.label",
          "en": "Difficulty"
        },
        "options": {
          "easy": {
            "key": "builtin.templates.uptime_3036.params.difficulty.options.easy",
            "en": "Easy"
          },
          "normal": {
            "key": "builtin.templates.uptime_3036.params.difficulty.options.normal",
            "en": "Normal"
          },
          "hard": {
            "key": "builtin.templates.uptime_3036.params.difficulty.options.hard",
            "en": "Hard"
          }
        }
      },
      "playable": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.playable.label",
          "en": "Playable (click / keyboard)"
        },
        "help": {
          "key": "builtin.templates.uptime_3036.params.playable.help",
          "en": "Off: the bot plays forever, a pure attract loop."
        },
        "options": {}
      },
      "idle_sec": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.idle_sec.label",
          "en": "Back to attract mode after (seconds idle)"
        },
        "options": {}
      },
      "resolution": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.resolution.label",
          "en": "Render resolution"
        },
        "help": {
          "key": "builtin.templates.uptime_3036.params.resolution.help",
          "en": "Lower is faster on small players; the look is deliberately pixelated."
        },
        "options": {
          "320": {
            "key": "builtin.templates.uptime_3036.params.resolution.options.320",
            "en": "Retro (320)"
          },
          "400": {
            "key": "builtin.templates.uptime_3036.params.resolution.options.400",
            "en": "Standard (400)"
          },
          "560": {
            "key": "builtin.templates.uptime_3036.params.resolution.options.560",
            "en": "Sharp (560)"
          }
        }
      },
      "crt": {
        "label": {
          "key": "builtin.templates.uptime_3036.params.crt.label",
          "en": "CRT scanlines"
        },
        "options": {}
      }
    }
  },
  "weather-forecast": {
    "version": "1.0.0",
    "author": "ScreenTinker",
    "name": {
      "key": "builtin.templates.weather_forecast.name",
      "en": "Weather forecast"
    },
    "description": {
      "key": "builtin.templates.weather_forecast.description",
      "en": "Current conditions and a five-day forecast from one of your Weather data sources. Your server fetches the weather itself; the template only lays it out."
    },
    "params": {
      "weather": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.weather.label",
          "en": "Weather data source"
        },
        "help": {
          "key": "builtin.templates.weather_forecast.params.weather.help",
          "en": "A data source of type Weather (Data Sources → New → Weather). Its location, units and language are set there."
        },
        "options": {}
      },
      "location": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.location.label",
          "en": "Location name"
        },
        "help": {
          "key": "builtin.templates.weather_forecast.params.location.help",
          "en": "The heading. Usually the city or the site's name."
        },
        "options": {}
      },
      "units_label": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.units_label.label",
          "en": "Temperature suffix"
        },
        "help": {
          "key": "builtin.templates.weather_forecast.params.units_label.help",
          "en": "Shown after every temperature: ° on its own, or °C / °F to match the data source."
        },
        "options": {}
      },
      "accent": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.accent.label",
          "en": "Accent colour"
        },
        "options": {}
      },
      "background": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.background.label",
          "en": "Background colour"
        },
        "options": {}
      },
      "text_color": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.text_color.label",
          "en": "Text colour"
        },
        "options": {}
      },
      "timezone": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.timezone.label",
          "en": "Clock timezone"
        },
        "help": {
          "key": "builtin.templates.weather_forecast.params.timezone.help",
          "en": "Leave empty to use the screen's own clock."
        },
        "options": {}
      },
      "locale": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.locale.label",
          "en": "Date language"
        },
        "help": {
          "key": "builtin.templates.weather_forecast.params.locale.help",
          "en": "For example en-GB or de-DE. Leave empty for the screen's language."
        },
        "options": {}
      },
      "clock_format": {
        "label": {
          "key": "builtin.templates.weather_forecast.params.clock_format.label",
          "en": "Clock format"
        },
        "options": {
          "12": {
            "key": "builtin.templates.weather_forecast.params.clock_format.options.12",
            "en": "12-hour"
          },
          "24": {
            "key": "builtin.templates.weather_forecast.params.clock_format.options.24",
            "en": "24-hour"
          }
        }
      }
    }
  },
  "weather-html": {
    "version": "1.0.0",
    "author": "ScreenTinker",
    "name": {
      "key": "builtin.templates.weather_html.name",
      "en": "Weather — animated"
    },
    "description": {
      "key": "builtin.templates.weather_html.description",
      "en": "A full-screen animated weather scene: the sky, rain, snow or sun follow the current conditions, with a five-day forecast and temperature ranges. Reads one of your Weather data sources; your server fetches the weather, so this template needs no network access at all."
    },
    "params": {
      "weather": {
        "label": {
          "key": "builtin.templates.weather_html.params.weather.label",
          "en": "Weather data source"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.weather.help",
          "en": "A data source of type Weather (Data Sources → New → Weather). Its location, units and language are set there."
        },
        "options": {}
      },
      "location": {
        "label": {
          "key": "builtin.templates.weather_html.params.location.label",
          "en": "Location name"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.location.help",
          "en": "Leave empty to use the data source's own place name."
        },
        "options": {}
      },
      "theme": {
        "label": {
          "key": "builtin.templates.weather_html.params.theme.label",
          "en": "Background"
        },
        "options": {
          "sky": {
            "key": "builtin.templates.weather_html.params.theme.options.sky",
            "en": "Follows the weather"
          },
          "solid": {
            "key": "builtin.templates.weather_html.params.theme.options.solid",
            "en": "Solid colour"
          }
        }
      },
      "background": {
        "label": {
          "key": "builtin.templates.weather_html.params.background.label",
          "en": "Solid background colour"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.background.help",
          "en": "Used when Background is set to Solid colour."
        },
        "options": {}
      },
      "accent": {
        "label": {
          "key": "builtin.templates.weather_html.params.accent.label",
          "en": "Accent colour"
        },
        "options": {}
      },
      "animate": {
        "label": {
          "key": "builtin.templates.weather_html.params.animate.label",
          "en": "Animate the scene"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.animate.help",
          "en": "Turn off for very low-powered players."
        },
        "options": {}
      },
      "show_clock": {
        "label": {
          "key": "builtin.templates.weather_html.params.show_clock.label",
          "en": "Show the clock"
        },
        "options": {}
      },
      "timezone": {
        "label": {
          "key": "builtin.templates.weather_html.params.timezone.label",
          "en": "Clock timezone"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.timezone.help",
          "en": "Leave empty to use the screen's own clock."
        },
        "options": {}
      },
      "locale": {
        "label": {
          "key": "builtin.templates.weather_html.params.locale.label",
          "en": "Clock and date language"
        },
        "help": {
          "key": "builtin.templates.weather_html.params.locale.help",
          "en": "For example en-GB. Leave empty for the screen's language."
        },
        "options": {}
      }
    }
  }
};

TRIGGER_DEFINITION = {
    # If adding a top level change create_claims in common.py
    "always": {
        "type": {},
        "keys": {},
    },
    "never": {"type": {}, "keys": {}},
    "groups": {
        "type": {},
        "keys": {
            # If adding a group key be sure to modify process_groups in common.py
            "has_or": {
                "type": [],
                "contents": "",
            },
            "has_and": {
                "type": [],
                "contents": "",
            },
            "has_not": {
                "type": [],
                "contents": "",
            },
        },
    },
    "attributes": {
        "type": {},
        "keys": {
            # If adding a key or */keys be sure to modify process_user_attributes in common.py
            "join_condition": {
                "type": "",
                "choices": ["or", "and"],
            },
            "*": {
                "type": {},
                "keys": {
                    "contains": {
                        "type": "",
                    },
                    "matches": {
                        "type": "",
                    },
                    "ends_with": {
                        "type": "",
                    },
                    "equals": {
                        "type": "",
                    },
                    "in": {
                        "type": [],
                        "contents": "",
                    },
                },
            },
        },
    },
}

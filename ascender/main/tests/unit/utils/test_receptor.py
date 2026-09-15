from ascender.main.tasks.receptor import _convert_args_to_cli


def test_file_cleanup_scenario():
    args = _convert_args_to_cli({'exclude_strings': ['ascender_423_', 'ascender_582_'], 'file_pattern': '/tmp/ascender_*_*'})
    assert ' '.join(args) == 'cleanup --exclude-strings=ascender_423_ ascender_582_ --file-pattern=/tmp/ascender_*_*'


def test_image_cleanup_scenario():
    # See input dict in ascender.main.tests.unit.models.test_ha
    args = _convert_args_to_cli(
        {
            'file_pattern': '',
            'process_isolation_executable': 'podman',
            'remove_images': ['quay.invalid/foo/bar:latest', 'quay.invalid/foo/bar:devel'],
            'image_prune': True,
        }
    )
    assert (
        ' '.join(args) == 'cleanup --remove-images=quay.invalid/foo/bar:latest quay.invalid/foo/bar:devel --image-prune --process-isolation-executable=podman'
    )

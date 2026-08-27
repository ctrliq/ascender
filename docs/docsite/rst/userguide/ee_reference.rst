
Execution Environment Setup Reference
=======================================

For detailed information about the |ee| definition,
refer to the `Ansible Builder documentation <https://ansible.readthedocs.io/projects/builder/en/latest/definition/#execution-environment-definition>`_.

Default execution environment for Ascender
-------------------------------------------

An |ee| image can be used inside of an ``ansible-runner`` project by placing these variables inside the ``env/settings`` file, inside of the private data directory.

::

	---
	container_image: image-name
	process_isolation_executable: podman # or docker
	process_isolation: true

The ``ctrliq.ascender`` collection is a subset of content included in the default Ascender |ee|. More details can be found in the `ascender-ee repository <https://github.com/ctrliq/ascender-ee>`_.

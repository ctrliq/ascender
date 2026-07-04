import pytest

from awx.main.models import JobTemplate, Job, JobHostSummary, WorkflowJob, Inventory, Project, Organization
from awx.main.models.jobs import _federated_inventory_has_matching_hosts


@pytest.mark.django_db
def test_prevent_slicing():
    jt = JobTemplate.objects.create(name='foo', job_slice_count=4)
    job = jt.create_unified_job(_prevent_slicing=True)
    assert job.job_slice_count == 1
    assert job.job_slice_number == 0
    assert isinstance(job, Job)


@pytest.mark.django_db
def test_job_host_summary_representation(host):
    job = Job.objects.create(name='foo')
    jhs = JobHostSummary.objects.create(host=host, job=job, changed=1, dark=2, failures=3, ignored=4, ok=5, processed=6, rescued=7, skipped=8)
    assert 'single-host changed=1 dark=2 failures=3 ignored=4 ok=5 processed=6 rescued=7 skipped=8' == str(jhs)

    # Representation should be robust to deleted related items
    jhs = JobHostSummary.objects.get(pk=jhs.id)
    host.delete()
    assert 'N/A changed=1 dark=2 failures=3 ignored=4 ok=5 processed=6 rescued=7 skipped=8' == str(jhs)


@pytest.mark.django_db
def test_jt_organization_follows_project():
    org1 = Organization.objects.create(name='foo1')
    org2 = Organization.objects.create(name='foo2')
    project1 = Project.objects.create(name='proj1', organization=org1)
    project2 = Project.objects.create(name='proj2', organization=org2)
    jt = JobTemplate.objects.create(name='foo', playbook='helloworld.yml', project=project1)
    assert jt.organization == org1
    jt.project = project2
    jt.save()
    assert JobTemplate.objects.get(pk=jt.id).organization == org2


@pytest.mark.django_db
class TestSlicingModels:
    def test_slice_workflow_spawn(self, slice_jt_factory):
        slice_jt = slice_jt_factory(3)
        job = slice_jt.create_unified_job()
        assert isinstance(job, WorkflowJob)
        assert job.job_template == slice_jt
        assert job.unified_job_template == slice_jt
        assert job.workflow_nodes.count() == 3

    def test_slices_with_JT_and_prompts(self, slice_job_factory):
        job = slice_job_factory(3, jt_kwargs={'ask_limit_on_launch': True}, prompts={'limit': 'foobar'}, spawn=True)
        assert job.launch_config.prompts_dict() == {'limit': 'foobar'}
        for node in job.workflow_nodes.all():
            assert node.limit is None  # data not saved in node prompts
            job = node.job
            assert job.limit == 'foobar'

    def test_effective_slice_count(self, job_template, inventory, organization):
        job_template.inventory = inventory
        assert job_template.inventory.hosts.count() == 0
        job_template.job_slice_count = 2
        job_template.inventory.hosts.create(name='foo1')
        assert job_template.get_effective_slice_ct({})
        inventory2 = Inventory.objects.create(organization=organization, name='fooinv')
        [inventory2.hosts.create(name='foo{}'.format(i)) for i in range(3)]
        assert job_template.get_effective_slice_ct({'inventory': inventory2})

    def test_effective_slice_count_prompt(self, job_template, inventory, organization):
        job_template.inventory = inventory
        # Add our prompt fields to the JT to allow overrides
        job_template.ask_job_slice_count_on_launch = True
        job_template.ask_inventory_on_launch = True
        # Set a default value of the slice count to something low
        job_template.job_slice_count = 2
        # Create an inventory with 4 nodes
        inventory2 = Inventory.objects.create(organization=organization, name='fooinv')
        [inventory2.hosts.create(name='foo{}'.format(i)) for i in range(4)]
        # The inventory slice count will be the min of the number of nodes (4) or the job slice (2)
        assert job_template.get_effective_slice_ct({'inventory': inventory2}) == 2
        # Now we are going to pass in an override (like the prompt would) and as long as that is < host count we expect that back
        assert job_template.get_effective_slice_ct({'inventory': inventory2, 'job_slice_count': 3}) == 3

    def test_slice_count_prompt_limited_by_inventory(self, job_template, inventory, organization):
        assert inventory.hosts.count() == 0
        job_template.inventory = inventory
        inventory.hosts.create(name='foo')

        unified_job = job_template.create_unified_job(job_slice_count=2)
        assert isinstance(unified_job, Job)

    def test_effective_slice_count_with_pinned_hosts(self, job_template, inventory):
        job_template.inventory = inventory
        job_template.job_slice_count = 5
        job_template.job_slice_pinned_hosts = ' localhost, missing-host ,'
        assert job_template.job_slice_pinned_hosts_list == ['localhost', 'missing-host']
        inventory.hosts.create(name='localhost')
        for i in range(3):
            inventory.hosts.create(name='foo{}'.format(i))
        # localhost is repeated in every slice, so only 3 hosts are worth distributing
        assert job_template.get_effective_slice_ct({}) == 3

    def test_effective_slice_count_all_hosts_pinned(self, job_template, inventory):
        job_template.inventory = inventory
        job_template.job_slice_count = 3
        job_template.job_slice_pinned_hosts = 'foo0,foo1'
        for i in range(2):
            inventory.hosts.create(name='foo{}'.format(i))
        # slicing is pointless when every host would end up in every slice
        assert job_template.get_effective_slice_ct({}) == 1

    def test_pinned_hosts_inherited_by_slice_jobs(self, slice_job_factory):
        # factory creates hosts foo0..foo2 with slice count 3; foo0 pinned leaves
        # two hosts to distribute, so only two slices get spawned
        workflow_job = slice_job_factory(3, jt_kwargs={'job_slice_pinned_hosts': 'foo0'}, spawn=True)
        assert workflow_job.workflow_nodes.count() == 2
        seen_hosts = []
        for node in workflow_job.workflow_nodes.all():
            job = node.job
            assert job.job_slice_pinned_hosts == 'foo0'
            # same call the task inventory build makes for the slice
            data = job.inventory.get_script_data(
                slice_number=job.job_slice_number, slice_count=job.job_slice_count, slice_pinned_hosts=job.job_slice_pinned_hosts_list
            )
            hosts = data['all']['hosts']
            assert 'foo0' in hosts
            assert len(hosts) == 2
            seen_hosts.extend(hosts)
        # the two remaining hosts got distributed, one per slice
        assert sorted(seen_hosts) == ['foo0', 'foo0', 'foo1', 'foo2']

    def test_pinned_hosts_fact_cache_alignment(self, slice_job_factory):
        # the fact cache host set of each slice must match the inventory the
        # slice actually runs against
        workflow_job = slice_job_factory(3, jt_kwargs={'job_slice_pinned_hosts': 'foo0', 'use_fact_cache': True}, spawn=True)
        for node in workflow_job.workflow_nodes.all():
            job = node.job
            data = job.inventory.get_script_data(
                slice_number=job.job_slice_number, slice_count=job.job_slice_count, slice_pinned_hosts=job.job_slice_pinned_hosts_list
            )
            assert sorted(host.name for host in job.get_hosts_for_fact_cache()) == data['all']['hosts']


# ---------------------------------------------------------------------------
# Federated inventory launch tests
# ---------------------------------------------------------------------------


@pytest.fixture
def federated_inv_factory(organization):
    """Return a helper that creates a federated inventory with N source inventories,
    each pre-populated with one host named 'host<i>'."""

    def _make(n_sources, host_prefix='host'):
        fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
        sources = []
        for i in range(n_sources):
            src = Inventory.objects.create(name=f'src-inv-{i}', kind='', organization=organization)
            src.hosts.create(name=f'{host_prefix}{i}')
            fed.input_inventories.add(src)
            sources.append(src)
        return fed, sources

    return _make


@pytest.mark.django_db
class TestFederatedInventoryLaunch:
    def test_produces_workflow_job(self, federated_inv_factory, organization):
        """Launching a JT against a federated inventory produces a WorkflowJob."""
        fed, _ = federated_inv_factory(2)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job()
        assert isinstance(job, WorkflowJob)
        assert job.is_sliced_job is True
        assert job.job_template == jt

    def test_one_node_per_source_inventory(self, federated_inv_factory, organization):
        """One WorkflowJobNode is created per source inventory."""
        fed, sources = federated_inv_factory(3)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job()
        assert job.workflow_nodes.count() == 3
        node_inv_ids = {n.ancestor_artifacts['source_inventory_id'] for n in job.workflow_nodes.all()}
        assert node_inv_ids == {s.id for s in sources}

    def test_empty_source_inventory_skipped(self, organization):
        """A source inventory with no hosts produces no node."""
        fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
        src_with_hosts = Inventory.objects.create(name='src-with-hosts', kind='', organization=organization)
        src_with_hosts.hosts.create(name='realhost')
        src_empty = Inventory.objects.create(name='src-empty', kind='', organization=organization)
        fed.input_inventories.add(src_with_hosts)
        fed.input_inventories.add(src_empty)

        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job()
        assert job.workflow_nodes.count() == 1
        assert job.workflow_nodes.first().ancestor_artifacts['source_inventory_id'] == src_with_hosts.id

    def test_limit_skips_non_matching_inventory(self, organization):
        """Source inventories whose hosts don't match the limit pattern are skipped."""
        fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
        src_web = Inventory.objects.create(name='src-web', kind='', organization=organization)
        src_web.hosts.create(name='web01')
        src_db = Inventory.objects.create(name='src-db', kind='', organization=organization)
        src_db.hosts.create(name='db01')
        fed.input_inventories.add(src_web)
        fed.input_inventories.add(src_db)

        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job(limit='web*')
        assert job.workflow_nodes.count() == 1
        assert job.workflow_nodes.first().ancestor_artifacts['source_inventory_id'] == src_web.id

    def test_limit_all_includes_all_non_empty(self, federated_inv_factory, organization):
        """No limit (or 'all') includes every non-empty source inventory."""
        fed, sources = federated_inv_factory(3)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job()
        assert job.workflow_nodes.count() == 3

    def test_child_node_carries_source_inventory_id(self, federated_inv_factory, organization):
        """Each node's ancestor_artifacts carries source_inventory_id, not the federated id."""
        fed, sources = federated_inv_factory(2)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job()
        for node in job.workflow_nodes.all():
            assert 'source_inventory_id' in node.ancestor_artifacts
            assert node.ancestor_artifacts['source_inventory_id'] != fed.id
            assert node.ancestor_artifacts['source_inventory_id'] in {s.id for s in sources}

    def test_federation_takes_precedence_over_slicing(self, organization):
        """When a JT has job_slice_count > 1 but uses a federated inventory,
        federation wins: a WorkflowJob with per-source nodes is created, not slice nodes."""
        fed = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
        for i in range(4):
            src = Inventory.objects.create(name=f'src-{i}', kind='', organization=organization)
            src.hosts.create(name=f'host{i}')
            fed.input_inventories.add(src)

        # job_slice_count=4, but inventory is federated
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization, job_slice_count=4)
        job = jt.create_unified_job()
        assert isinstance(job, WorkflowJob)
        # nodes must carry source_inventory_id, not job_slice
        for node in job.workflow_nodes.all():
            assert 'source_inventory_id' in node.ancestor_artifacts
            assert 'job_slice' not in node.ancestor_artifacts

    def test_prevent_federation_falls_through_to_normal_job(self, federated_inv_factory, organization):
        """_prevent_federation bypasses federated handling; child jobs use it."""
        fed, _ = federated_inv_factory(2)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        job = jt.create_unified_job(_prevent_federation=True)
        # Without federation the JT has 0 hosts in the federated inv, so slicing → plain Job
        assert isinstance(job, Job)

    def test_prompted_federated_inventory(self, federated_inv_factory, organization):
        """Federating via a prompted inventory (ask_inventory_on_launch) works."""
        fed, sources = federated_inv_factory(2)
        plain_inv = Inventory.objects.create(name='plain', kind='', organization=organization)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=plain_inv, organization=organization, ask_inventory_on_launch=True)
        job = jt.create_unified_job(inventory=fed)
        assert isinstance(job, WorkflowJob)
        assert job.workflow_nodes.count() == 2

    def test_relaunch_child_job_stays_job(self, federated_inv_factory, organization):
        """Relaunching a workflow child job should not re-enter federated workflow creation."""
        fed, _ = federated_inv_factory(2)
        jt = JobTemplate.objects.create(name='fed-jt', inventory=fed, organization=organization)
        workflow_job = jt.create_unified_job()
        node = workflow_job.workflow_nodes.first()
        child_job = node.unified_job_template.create_unified_job(**node.get_job_kwargs())

        relaunched_job = child_job.copy_unified_job()

        assert isinstance(relaunched_job, Job)
        assert not isinstance(relaunched_job, WorkflowJob)
        assert relaunched_job.inventory_id == child_job.inventory_id
        assert relaunched_job.preferred_instance_groups_cache == child_job.preferred_instance_groups_cache


@pytest.mark.django_db
class TestFederatedInventoryHasMatchingHosts:
    """Unit-style tests for _federated_inventory_has_matching_hosts()."""

    def _make_inv(self, organization, host_names=(), group_names=()):
        inv = Inventory.objects.create(name='test-src', kind='', organization=organization)
        for name in host_names:
            inv.hosts.create(name=name)
        for name in group_names:
            inv.groups.create(name=name)
        return inv

    def test_no_limit_empty_inventory(self, organization):
        inv = self._make_inv(organization)
        assert _federated_inventory_has_matching_hosts(inv, '') is False

    def test_no_limit_non_empty_inventory(self, organization):
        inv = self._make_inv(organization, host_names=['h1'])
        assert _federated_inventory_has_matching_hosts(inv, '') is True

    def test_all_star_patterns(self, organization):
        inv = self._make_inv(organization, host_names=['h1'])
        assert _federated_inventory_has_matching_hosts(inv, 'all') is True
        assert _federated_inventory_has_matching_hosts(inv, '*') is True

    def test_exact_host_match(self, organization):
        inv = self._make_inv(organization, host_names=['web01', 'db01'])
        assert _federated_inventory_has_matching_hosts(inv, 'web01') is True
        assert _federated_inventory_has_matching_hosts(inv, 'missing') is False

    def test_exact_group_match(self, organization):
        inv = self._make_inv(organization, host_names=['h1'], group_names=['webservers'])
        assert _federated_inventory_has_matching_hosts(inv, 'webservers') is True

    def test_glob_host_match(self, organization):
        inv = self._make_inv(organization, host_names=['web01', 'web02', 'db01'])
        assert _federated_inventory_has_matching_hosts(inv, 'web*') is True
        assert _federated_inventory_has_matching_hosts(inv, 'app*') is False

    def test_glob_group_fallback(self, organization):
        inv = self._make_inv(organization, host_names=['h1'], group_names=['webservers', 'dbservers'])
        assert _federated_inventory_has_matching_hosts(inv, 'web*') is True
        assert _federated_inventory_has_matching_hosts(inv, 'app*') is False

    def test_trailing_star_fast_path(self, organization):
        """Trailing-star glob uses a DB startswith fast path; verify correctness
        against the general fnmatch path for both matches and non-matches."""
        inv = self._make_inv(organization, host_names=['web01', 'web02', 'db01'])
        # Standard trailing-star: should match via startswith fast path
        assert _federated_inventory_has_matching_hosts(inv, 'web*') is True
        assert _federated_inventory_has_matching_hosts(inv, 'db*') is True
        assert _federated_inventory_has_matching_hosts(inv, 'app*') is False
        # Pattern with no prefix before the star matches anything non-empty
        assert _federated_inventory_has_matching_hosts(inv, '*') is True
        # Complex globs that must NOT take the fast path (fall through to fnmatch)
        # mid-star
        assert _federated_inventory_has_matching_hosts(inv, 'web*01') is True
        # question-mark
        assert _federated_inventory_has_matching_hosts(inv, 'web??') is True
        assert _federated_inventory_has_matching_hosts(inv, 'xyz??') is False

    def test_ungrouped(self, organization):
        inv = Inventory.objects.create(name='test-src', kind='', organization=organization)
        grouped_host = inv.hosts.create(name='grouped')
        ungrouped_host = inv.hosts.create(name='ungrouped')
        grp = inv.groups.create(name='mygroup')
        grp.hosts.add(grouped_host)
        assert _federated_inventory_has_matching_hosts(inv, 'ungrouped') is True
        # Remove ungrouped host; only grouped remains
        ungrouped_host.delete()
        assert _federated_inventory_has_matching_hosts(inv, 'ungrouped') is False

    def test_complex_pattern_failsafe(self, organization):
        """Complex operator patterns always include the inventory (fail-safe)."""
        inv = self._make_inv(organization, host_names=['h1'])
        assert _federated_inventory_has_matching_hosts(inv, 'web:db') is True
        assert _federated_inventory_has_matching_hosts(inv, 'web&db') is True
        assert _federated_inventory_has_matching_hosts(inv, '!web') is True

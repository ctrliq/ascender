### Variables From Sources Only

Inventory sources write the variables of the `all` group (for example the files under
`group_vars/all/` of an SCM source) into the inventory variables. With
`overwrite_vars` set, a sync removes the inventory variables that the same source
wrote on its previous sync and no longer provides. That cleanup is deliberately
careful, so a few kinds of variables survive it:

* variables nobody tracked, such as the ones written by syncs that ran before
  Ascender recorded what each source writes, or the ones added by hand,
* variables edited by hand after the sync that wrote them,
* variables written by an inventory source that has since been deleted.

On an inventory whose variables are meant to come only from its sources, those
leftovers are noise at best. At worst a renamed variable keeps its old value forever
and a role keeps reading it.

The `variables_from_sources_only` flag on the inventory makes every sync remove the
inventory variables that no source of the inventory provides:

```bash
curl -X PATCH -H 'Content-Type: application/json' \
     -d '{"variables_from_sources_only": true}' \
     https://ascender.example.com/api/v2/inventories/5/
```

In the UI the flag is a checkbox under `Options` in the inventory form, and it shows
up under `Enabled Options` in the inventory details.

The field defaults to `false`, so nothing changes for existing inventories. It is only
accepted on regular inventories: smart inventories have no sources, and constructed
inventories already replace their variables on every sync when `overwrite_vars` is set.

#### What a sync keeps

A variable is kept when the source being synced provides it, or when another source of
the same inventory provided it on its own last sync. Everything else in the inventory
variables is removed, whether the source has `overwrite_vars` set or not, and the sync
output lists each removed variable.

Several sources can share an inventory. A sync of one of them never removes variables
that another one provides, and if two sources provide the same variable, the last one
to sync sets its value, as before.

A variable edited by hand is overwritten by the next sync if a source provides it, and
removed by the next sync if no source does. If a variable has to be set by hand, set it
in the source instead, or leave this flag off.

#### Sources that have not synced yet

Each source records which variables it wrote at the end of every sync. A source that
has not synced since that record was introduced (including a source just added to the
inventory) has no record, so Ascender cannot tell which of the current variables belong
to it. While any source of the inventory is in that state, syncs of the other sources
remove nothing and log a warning naming the sources that still have to sync:

```
Inventory variables not provided by any source were kept: "aws" must sync before they can be removed
```

Once every source has synced at least once, the next sync does the cleanup. A failed
sync records nothing and changes nothing, like any other failed sync.

#### Deleting a source

The variables a deleted source wrote are no longer provided by anyone, so the next sync
of any other source of the inventory removes them. If the deleted source was the only
one, they stay until a new source syncs.

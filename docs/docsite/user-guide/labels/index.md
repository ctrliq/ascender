---
title: Labels
description: Browse the labels in use across your Ascender templates and use labels as pseudo-folders to group templates.
weight: 52
---

The **Labels** view lists the labels in use across your templates and lets you open the templates that carry each one. Access it by clicking **Labels** from the **Resources** section of the left navigation bar. Ascender has no folders for templates, so this view is how you browse templates by group.

A label is a short piece of text, such as "dev" or "networking", that you attach to a template to describe it. You create a label by adding it to a template, and each label belongs to the organization of the template's project. The **Labels** field in [Job Templates](../job-templates) covers adding and removing them.

![Labels view listing the labels in use, with Name and Organization columns](/assets/images/ug-labels-list-view.webp)

The list shows two columns. **Name** is the text of the label, and clicking the sort control on this column orders the list alphabetically. **Organization** is the organization the label belongs to. Use the search field above the list to filter by label name, or switch the search key to **Organization** to filter by organization name. Both searches match partial text.

<Hint type="note">

Only labels that are in use appear in this list. A label that is not attached to any template is not shown, so removing a label from the last template that references it also removes it from this view. This list is read-only. You create, rename, and remove labels from the templates that use them, not from this screen.

</Hint>

To see the history of changes to labels, click the **Activity Stream** icon from the **Labels** view.

## Using labels as pseudo-folders

Ascender has no folders for templates. A label used as a pseudo-folder gives you the same result: the label is the folder, and the templates carrying it are its contents.

Clicking a label name opens the **Templates** view filtered to the templates that carry that label, whatever their organization. Only that label matches: clicking `dev` does not list templates that carry only `dev-east`, and a label of the same name in another organization is a separate label, so its templates do not appear.

To organize your templates this way:

1. Decide on the groupings you want, for example one label per team, per environment, or per application.
2. Add the appropriate label to each template using the **Labels** field on the template, as described in [Job Templates](../job-templates). A template can carry more than one label, so one template can appear in several groupings.
3. Click **Labels** from the left navigation bar, then click a label name to see the templates in that grouping.

Labels have no hierarchy, so express any nesting in the name itself, for example `platform-networking` and `platform-storage`.

##### SUMMARY
<!--- What the change does and why, including design decisions. -->

<!---
If this fixes an issue, put "related #nnn" in the commit message and here;
still explain what the change does.
-->

##### ISSUE TYPE
<!--- Pick one below and delete the rest: -->
 - Breaking Change
 - New or Enhanced Feature
 - Bug, Docs Fix or other nominal change

##### COMPONENT NAME
<!--- Pick the areas this touches and delete the rest: -->
 - API
 - UI
 - Jobs and the task runner
 - Database schema
 - Images and deployment
 - Docs
 - Other

##### CHECKLIST
<!--- See CONTRIBUTING.md. -->
- [ ] Every commit is signed off (`git commit -s`, see DCO_1_1.md).
- [ ] `make check`, `make lint` and `make test` pass locally.
- [ ] A change in behaviour updates the doc in `docs/` that describes it.
- [ ] API responses keep the old application's fields, order and wording.
- [ ] A schema change is a new migration in `src/internal/db/migrations/`.

##### ADDITIONAL INFORMATION
<!---
Anything else that helps a reviewer: a step-by-step reproduction for a bug
without an issue, screenshots of UI changes, or command output before and
after the change.
-->

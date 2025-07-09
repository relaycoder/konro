####

beside single file, multi file, I also want feature per record where dir name is table name, and the files is single record row. the file naming configurable can be auto incremental integer or uuid, the extension also configurable to yaml or json. the availability configurable in-memory or on-demand


----

just add new feature a new file storage strategy called 'per-record' where each record is a separate file. This is available in both 'in-memory' and 'on-demand' modes and support JSON or YAML formats.

please create the test files and cases to verify that implemented feature in integration test

----

update readme

####

add integration test files and cases for on-demand feature


####

data aggregation

####

primary key can also use uuid
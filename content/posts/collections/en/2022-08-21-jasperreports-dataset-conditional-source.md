---
title: JasperReports conditional data/connection source
url: jasperreports-conditional-datasource-connection
id: 93
category:
  - other: Misc
tags:
  - jasperreports
author: Damian Terlecki
date: 2022-08-21T20:00:00
---

JasperReports is an open-source tool for generating reports in many formats like PDF, Excel, HTML, and many others.
It can be used as a Java library or a standalone server and comes with a good editor (TIBCO Jaspersoft® Studio) for preparing report templates.
You can provide input through various means, but in general, there are three types of input sources as shown in methods of 
`net.sf.jasperreports.engine.JasperFillManager`:
- parameters that can be passed from the code or entered by a user in the editor;
- `net.sf.jasperreports.engine.JRDataSource` with implementation for bean collections; 
- `java.sql.Connection` that provides data from a database.

## Data source in subDataset

You can interchange the data and connection sources. Yet, it is somewhat harder to achieve the same thing at the level of sub-datasets that display a dynamic number of sub-records.
The `datasetRun` element of the report template used to configure this accepts either the `connectionExpression` or `dataSourceExpression`, but not both.

```xml
<element name="datasetRun">
    <annotation>
        <documentation>Subdataset instantiation information for a chart/crosstab dataset.</documentation>
    </annotation>
    <complexType>
        <sequence>
            <!--...-->
            <choice minOccurs="0" maxOccurs="1">
                <element ref="jr:connectionExpression"/>
                <element ref="jr:dataSourceExpression"/>
            </choice>
            <!--...-->
        </sequence>
        <attribute name="subDataset" type="string" use="required">
            <annotation>
                <documentation>The name of the <elem>subdataset</elem> to instantiate.</documentation>
            </annotation>
        </attribute>
        <!--...-->
    </complexType>
</element>
```

Sometimes you might want to use an inlined and database-independent data source.
This is useful when designing the report without the real data, as well as to prepare placeholders.
Other times you might want to just dynamically change between sources if your application happens to have already fetched the necessary data.

There is no clear way to specify a condition that dynamically chooses one source over the other:
This [schema](http://jasperreports.sourceforge.net/xsd/jasperreport.xsd) constraint is reflected in the configuration options visible in the editor for a table element:

<img src="/img/hq/jasperreports-conditional-datasource.png" alt="JasperReports Table Dataset" title="JasperReports Table Dataset">

## Conditional data/connection source

To bypass the `<choice minOccurs="0" maxOccurs="1">` constraint, do not define the expressions at all in the JRXML. Instead, pass either the `REPORT_DATA_SOURCE` or `REPORT_CONNECTION` parameter to the sub-dataset.
This way you can achieve a conditional data/connection source:

```xml
<!--...-->
<datasetRun subDataset="myDataSet" uuid="d015cfdd-7c38-4915-8fb7-e493eb381ec4">
	<datasetParameter name="REPORT_DATA_SOURCE">
		<datasetParameterExpression><![CDATA[
		$P{usePlaceholderDataSource} 
			? new net.sf.jasperreports.engine.data.ListOfArrayDataSource(
				Arrays.asList(new String[]{"John", "Doe"}, new String[]{"Mary", "Sue"}),
				new String[]{"firstName", "lastName"})
			: null
		]]></datasetParameterExpression>
	</datasetParameter>
    <datasetParameter name="REPORT_CONNECTION">
        <datasetParameterExpression><![CDATA[
        $P{usePlaceholderDataSource} 
			? null
			: $P{REPORT_CONNECTION}
        ]]></datasetParameterExpression>
    </datasetParameter>
</datasetRun>
<!--...-->
```

When the `usePlaceholderDataSource` flag is on, the report will be filled with inlined placeholder data.
Otherwise, a connection from the master report will be used to fetch real data. I've used this with
JasperReports 6.20.0, but feel free to try this even with some older versions.
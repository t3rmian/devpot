---
title: Warunkowe źródło danych/połączenie w JasperReports
url: jasperreports-warunkowe-źródło-danych-połączenie
id: 93
category:
  - other: Inne
tags:
  - jasperreports
author: Damian Terlecki
date: 2022-08-21T20:00:00
---

JasperReports to otwartoźródłowe narzędzie do generowania raportów w wielu formatach, takich jak np.: PDF, Excel, HTML.
Jako biblioteka Java lub samodzielny serwer w połączeniu z edytorem (TIBCO Jaspersoft® Studio) znacznie upraszcza przygotowywania różnego typu szablonów.
Dane potrzebne do wygenerowania raportu wprowadzić możemy na trzy główne sposoby, jak pokazano w metodach klasy `net.sf.jasperreports.engine.JasperFillManager`:
- jako parametry przekazane w kodzie bądź podane przez użytkownika edytora;
- przy pomocy implementacji interfejsu `net.sf.jasperreports.engine.JRDataSource`, np. wspierającej kolekcję beanów; 
- odpytując bazę poprzez połączenie `java.sql.Connection`.

## Podzbiór danych raportu

Źródło danych i połączenie bez większego problemu podmienić możesz bez duplikacji elementów raportu. Nieco trudniej jest osiągnąć to samo na poziomie
podzbiorów danych (*subDataset*), które wyświetlają dynamiczną liczbę wierszy np. w tabeli.
Odpowiedzialny za to element `datasetRun` szablonu raportu akceptuje opcję `connectionExpression` lub
`dataSourceExpression`, ale nie obie.

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

Użycie wbudowanego i niezależnego od bazy danych źródła danych może czasami usprawnić pracę.
Jest to przydatne przy projektowaniu raportu, a także przy przygotowywaniu placeholderów.
Innym razem opcja zmiany źródła jest optymalna, gdy aplikacja pobrała już niezbędne dane do raportu i nie musimy odpytywać bazy.

Niestety nie ma jasnego sposobu na zdefiniowanie warunku, który dynamicznie wybrałby oczekiwane źródło.
To ograniczenie [schematu](http://jasperreports.sourceforge.net/xsd/jasperreport.xsd)
znajduje odzwierciedlenie w opcjach konfiguracyjnych widocznych w edytorze dla tabeli:

<img src="/img/hq/jasperreports-conditional-datasource.png" alt="JasperReports Table Dataset" title="JasperReports Table Dataset">

## Warunkowe źródło danych/połączenie

Aby ominąć ograniczenie `<choice minOccurs="0" maxOccurs="1">`, pomiń definicję wyrażeń wskazujących na źródło danych w definicji raportu JRXML. Zamiast tego przekaż źródło
za pomocą parametru `REPORT_DATA_SOURCE` lub `REPORT_CONNECTION` do podzbioru danych. W ten sposób uzyskasz warunkową konfigurację źródła
danych/połączenia:

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

Gdy flaga `usePlaceholderDataSource` będzie włączona, raport zostanie wypełniony wprowadzonymi danymi. W
przeciwnym razie do pobrania rzeczywistych danych zostanie użyte połączenie z raportu głównego (np. bazy danych).
Podejście to działa w wersji JasperReports 6.20.0, ale z powodzeniem skorzystasz z niego również w nieco starszych wersjach narzędzi.
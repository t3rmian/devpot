---
title: Oracle Container Registry licenses overview
url: oracle-container-registry-licenses
id: 115
category:
  - other: Misc
tags:
  - oracle
author: Damian Terlecki
date: 2023-09-03T20:00:00
---

Most Oracle Docker images are only available on the Oracle Container Registry at https://container-registry.oracle.com/.
The main reason for this is the licensing policy whereby Oracle makes the images available under all sorts of terms, starting with
open source licenses, through trial/standard terms, ending with dedicated licenses.

<img src="/img/hq/oracle-standard-terms-and-restrictions.png" alt="Oracle Standard Terms and Restrictions agreement image" title="Prerequisite for pulling one of Oracle Container Registry images">

## Licensed Products

Generally, you can find an image under one of the following 5 licenses

Open Source Terms and Restrictions
- Database: Oracle Database Express Edition/Free/Observability Exporter/Operator for Kubernetes, Oracle REST Data Services, Oracle Transaction Manager for Microservices, Oracle SQLDeveloper Command Line
- GraalVM: GraalVM Community Edition/compact JDK/compact Native Image/compact Nodejs
- Other: Oracle GoldenGate Free
- Java: Oracle OpenJDK
- Middleware: Coherence CE, Coherence Operator, Oracle WebLogic Kubernetes Operator, WebLogic Monitoring Exporter
- MySQL: Community versions of Cluster, NDB/Kubernetes Operator, Router, Server
- OS: Oracle Linux, Container Registry
- Cloud Native images
- Other: Oracle Linux Automation Manager 2.0, TimesTen XE, Verrazzano Enterprise images

Oracle Standard Terms and Restrictions
- Database: Oracle Database Enterprise Edition, Oracle Global Service Manager, Oracle Instant Client, Oracle Real Application Clusters
- Java: Oracle JDK, Oracle JRE
- Most of the Middleware section
- MySQL: Commercial versions of Cluster, NDB/Kubernetes Operator, Router, Server
- Other: Oracle TimesTen In-Memory Database, Verrazzano Enterprise image examples

Oracle Other Closed Source Licenses
- GraalVM: GraalVM Enterprise Edition/compact JDK/compact Native Image/compact Nodejs

Oracle JDK Container Images Licenses
- Java: Oracle JDK

OCR CPU Repository Terms and Restrictions
- Selected Middleware

## Licenses TLDR

<table class="rwd">
   <thead>
      <tr>
         <th>License</th>
         <th>TLDR</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="License">
            Open Source Terms and Restrictions
         </td>
         <td data-label="TLDR">
             Container image and software is licensed under open source license(s) terms. Specific licenses are rarely listed in the image description. Often, you have to verify them on your own. 
         </td>
      </tr>
      <tr>
         <td data-label="License">
            Oracle Standard Terms and Restrictions
         </td>
         <td data-label="TLDR">
            It is the standard license that is applied when the product is not open source:
            <ul>
              <li>Trial license available if no prior license, terminate or acquire a license after trial.</li>
              <li>Temporary use for evaluation/testing (non-production) purposes. May not be used to update any unsupported (not covered by a valid license/support) programs.</li>
              <li>No technical support, liability, warranties, reverse engineering or altering Oracle-related classes. Source code is provided only for reference, and Oracle may audit your use.</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td data-label="License">
            Oracle Other Closed Source Licenses
         </td>
         <td data-label="TLDR">
            Currently, there is one combination of Oracle Technology Network License and GraalVM Enterprise Edition for early adopters in the context of this license type.
            <ul>
              <li>Existing Oracle Java SE Subscription users follow their agreements.</li>
              <li>Others get limited use, either:
                <ul>
                  <li>in the context of OCI (Oracle Cloud Infrastructure) or;</li>
                  <li>for development, testing, prototyping or demonstrating their applications.</li>
                </ul>
              </li>
              <li>No technical support, liability, warranties, reverse engineering or altering Oracle-related classes. Source code is provided only for reference, and Oracle may audit your use.</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            OCR CPU Repository Terms and Restrictions
         </td>
         <td data-label="Podsumowanie">
            This is a license of typical production images (after application of critical patch updates) for customers who have access to support for a given product.
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            Oracle JDK Container Images Licenses
         </td>
         <td data-label="Podsumowanie">
            The Oracle No-Fee Terms and Conditions (NFTC) license for the latest versions of the LTS Oracle JDK image together with the Oracle Linux License currently qualifies for this type of license.<br/>It allows free use even in commercial and production contexts. As in previous licenses – without technical support, guarantees, etc., but without audit restrictions.
         </td>
      </tr>
    </tbody>
</table>

Finally, if the licenses do not suit you, you can create your own images from scratch.
But even with the custom image, you will still need to obtain the licenses for Oracle products the same way as required by Oracle Standard Terms and Restrictions trial end. 

> Note: The above information does not constitute legal advice and may not be up-to-date over time. Think of it as an overview of the licensing available in the container registry and review them at the source for use.

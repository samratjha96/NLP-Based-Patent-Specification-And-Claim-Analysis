(() => {
  const specificationText = `[0001] This illustrative disclosure describes a distributed optical sensing system for monitoring rotating industrial equipment. The example is synthetic and is provided only to demonstrate patent-review workflows without retrieving an official patent record.

[0002] An optical sensing probe includes a light source, a fiber Bragg grating, and a photodetector. The light source directs interrogation light through an optical fiber to the fiber Bragg grating, and the photodetector generates a measurement signal representing reflected wavelength energy. A mounting body couples the optical sensing probe to a bearing housing so that strain and vibration of the bearing housing change the reflected wavelength.

[0003] A controller receives the measurement signal and associates the signal with a timestamp and a probe identifier. A memory stores a calibration table containing a baseline wavelength, a temperature coefficient, and a machine-specific alert threshold for each optical sensing probe. The controller determines an ambient temperature from a temperature sensor positioned adjacent to the bearing housing.

[0004] The controller performs temperature compensation by selecting the temperature coefficient associated with the probe identifier and adjusting the measurement signal according to the ambient temperature. In one implementation, the controller subtracts a predicted thermal wavelength shift from an observed wavelength shift to produce a compensated vibration value. This temperature compensation reduces false vibration indications caused by normal heating of the monitored machine.

[0005] The controller compares the compensated vibration value with the machine-specific alert threshold. When the compensated vibration value exceeds the threshold for a confirmation interval, the controller creates an alert record containing the probe identifier, timestamp, ambient temperature, compensated vibration value, and threshold. The confirmation interval may exclude isolated transient measurements while preserving evidence of a persistent machine condition.

[0006] A communications interface connects the controller to a maintenance server through a wired network or a wireless mesh network. When network connectivity is available, the communications interface sends measurement summaries and alert records to the maintenance server. The maintenance server may display a trend for each bearing housing and route a maintenance notification to an assigned technician.

[0007] When network connectivity is unavailable, the controller stores timestamped measurement signals and alert records in a local buffer. The controller periodically tests network connectivity and, after connectivity is restored, transmits the buffered records in chronological order. A sequence number enables the maintenance server to identify a missing record without treating a delayed record as a new alert.

[0008] Multiple optical sensing probes may share the wireless mesh network while retaining separate calibration data. The controller can apply a different temperature coefficient and alert threshold to each probe, thereby accommodating different bearing housings, mounting positions, and operating temperature ranges. The disclosed arrangement supports continuous condition monitoring even during an intermittent network outage.`;

  const claimsText = `1. A sensing system comprising: an optical sensing probe configured to generate a measurement signal representing a wavelength response of a monitored machine; a temperature sensor configured to measure an ambient temperature; a controller configured to determine a compensated vibration value by applying temperature compensation to the measurement signal according to the ambient temperature; a memory configured to store a machine-specific alert threshold; and a communications interface coupled to a maintenance server, wherein the controller is configured to create an alert record when the compensated vibration value exceeds the machine-specific alert threshold, and wherein the transmitter sends the alert record to the maintenance server.

2. The sensing system of claim 1, wherein the memory includes a local buffer and the controller stores the alert record in the local buffer while network connectivity is unavailable.

3. The sensing system of claim 2, wherein the controller transmits buffered alert records in chronological order after network connectivity is restored and associates each buffered alert record with a sequence number.`;

  const transmitterStart = claimsText.indexOf("the transmitter");
  const transmitterEnd = transmitterStart + "the transmitter".length;

  const supportQueries = [
    "temperature compensation based on ambient temperature",
    "store measurements while network connectivity is unavailable",
    "maintenance alert based on a machine-specific threshold"
  ];

  window.PatentAgilityDemoRecord = {
    is_demo: true,
    source: "Illustrative synthetic patent record; not an official USPTO record",
    display_identifier: "Example DS-101",
    record_id: "demo:ds-101",
    application_number: "",
    patent_number: "",
    title: "Distributed Optical Condition Sensing with Temperature Compensation",
    abstract: "A distributed optical sensing platform compensates machine-vibration measurements for ambient temperature, buffers records during network outages, and issues maintenance alerts from probe-specific thresholds.",
    status: "Illustrative example",
    filing_date: "",
    inventors: ["Example Inventor"],
    specification_text: specificationText,
    claims_text: claimsText,
    specification_character_count: specificationText.length,
    claims_character_count: claimsText.length,
    review_examples: {
      support_queries: supportQueries,
      examiner_query: "Art Unit 2123"
    },
    demo_results: {
      support: {
        reviewed: true,
        review_status: "Illustrative result reviewed for this example",
        profile: "demo",
        results: [
          {
            query: supportQueries[0],
            hits: [
              {
                paragraph_id: 3,
                sentence_id: 0,
                sentence: "The controller performs temperature compensation by selecting the temperature coefficient associated with the probe identifier and adjusting the measurement signal according to the ambient temperature.",
                score: 0.964
              },
              {
                paragraph_id: 3,
                sentence_id: 1,
                sentence: "In one implementation, the controller subtracts a predicted thermal wavelength shift from an observed wavelength shift to produce a compensated vibration value.",
                score: 0.881
              }
            ]
          },
          {
            query: supportQueries[1],
            hits: [
              {
                paragraph_id: 6,
                sentence_id: 0,
                sentence: "When network connectivity is unavailable, the controller stores timestamped measurement signals and alert records in a local buffer.",
                score: 0.978
              },
              {
                paragraph_id: 6,
                sentence_id: 1,
                sentence: "The controller periodically tests network connectivity and, after connectivity is restored, transmits the buffered records in chronological order.",
                score: 0.913
              }
            ]
          },
          {
            query: supportQueries[2],
            hits: [
              {
                paragraph_id: 4,
                sentence_id: 0,
                sentence: "The controller compares the compensated vibration value with the machine-specific alert threshold.",
                score: 0.951
              },
              {
                paragraph_id: 4,
                sentence_id: 1,
                sentence: "When the compensated vibration value exceeds the threshold for a confirmation interval, the controller creates an alert record containing the probe identifier, timestamp, ambient temperature, compensated vibration value, and threshold.",
                score: 0.894
              }
            ]
          }
        ]
      },
      antecedent: {
        reviewed: true,
        review_status: "Illustrative result reviewed for this example",
        claim_text: claimsText,
        mentions: [
          { kind: "intro", text: "a sensing system", key: "sensing system", start: 3, end: 19 },
          { kind: "intro", text: "an optical sensing probe", key: "optical sensing probe", start: 33, end: 57 },
          { kind: "ref", text: "the transmitter", key: "transmitter", start: transmitterStart, end: transmitterEnd }
        ],
        issues: [
          {
            code: "missing_antecedent",
            severity: "high",
            title: "Missing antecedent basis",
            kind: "ref",
            text: "the transmitter",
            key: "transmitter",
            start: transmitterStart,
            end: transmitterEnd
          }
        ],
        summary: { high: 1, info: 0, total: 1 }
      },
      linguistic: {
        reviewed: true,
        review_status: "Illustrative result reviewed for this example",
        claim_text: claimsText,
        segment_count: 5,
        segments: [
          { idx: 1, kind: "preamble", text: "A sensing system comprising" },
          { idx: 2, kind: "limitation", text: "an optical sensing probe configured to generate a measurement signal representing a wavelength response of a monitored machine" },
          { idx: 3, kind: "limitation", text: "a controller configured to determine a compensated vibration value by applying temperature compensation to the measurement signal according to the ambient temperature" },
          { idx: 4, kind: "limitation", text: "a memory configured to store a machine-specific alert threshold" },
          { idx: 5, kind: "wherein", text: "wherein the controller is configured to create an alert record when the compensated vibration value exceeds the machine-specific alert threshold" }
        ],
        frames: [
          { anchor_verb: "comprising", object_np: "sensing system", leaves: [], or_alternatives: [] },
          { anchor_verb: "generate", object_np: "measurement signal", leaves: [{ label: "Represents", text: "wavelength response of a monitored machine" }], or_alternatives: [] },
          { anchor_verb: "determine", object_np: "compensated vibration value", leaves: [{ label: "Method", text: "temperature compensation" }, { label: "Input", text: "ambient temperature" }], or_alternatives: [] },
          { anchor_verb: "store", object_np: "machine-specific alert threshold", leaves: [], or_alternatives: [] },
          { anchor_verb: "create", object_np: "alert record", leaves: [{ label: "Condition", text: "compensated vibration value exceeds the machine-specific alert threshold" }], or_alternatives: [] }
        ]
      }
    }
  };
})();

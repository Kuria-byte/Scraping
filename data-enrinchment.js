const fs = require('fs');

// Load the scraped MP data
function loadMPData(filePath) {
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Error loading MP data: ${error.message}`);
    return [];
  }
}

// Leadership positions in the National Assembly - using more flexible name matching
const leadershipPositions = [
  { 
    keywords: ["WETANG'ULA", "WETANGULA", "MOSES"], 
    position: "Speaker of the National Assembly",
    minMatches: 1
  },
  { 
    keywords: ["KIMANI", "ICHUNG'WAH", "ICHUNGWAH"], 
    position: "Majority Leader",
    minMatches: 1
  },
  { 
    keywords: ["JUNET", "MOHAMED", "MOHAMMED", "SHEIKH"], 
    position: "Minority Leader",
    minMatches: 1
  },
  { 
    keywords: ["MBADI", "JOHN", "NG'ONGO"], 
    position: "Committee on Selection Vice Chairperson",
    minMatches: 2
  },
  { 
    keywords: ["KIMUNYA", "AMOS", "MUHINGA"], 
    position: "Committee on Selection Chairperson",
    minMatches: 1
  },
  { 
    keywords: ["SHOLLEI", "GLADYS", "JEPKOSGEI", "BOSS"], 
    position: "Deputy Speaker",
    minMatches: 1
  }
];

// Key parliamentary committees based on research
const parliamentaryCommittees = {
  "Budget and Appropriations": {
    description: "Investigates, inquires into and reports on all matters related to coordination, control and monitoring of the national budget",
    keywords: ["BUDGET", "APPROPRIATION", "FINANCE"],
    members: []
  },
  "Defence and Foreign Relations": {
    description: "Defence, intelligence, foreign relations, diplomatic and consular services, international boundaries",
    keywords: ["DEFENCE", "DEFENSE", "FOREIGN", "RELATION", "DIPLOMATIC", "INTERNATIONAL"],
    members: []
  },
  "Administration and National Security": {
    description: "National security, police services, public administration, public service, prisons, immigration",
    keywords: ["SECURITY", "ADMINISTRATION", "POLICE", "PRISON"],
    members: []
  },
  "Agriculture and Livestock": {
    description: "Agriculture, livestock, irrigation, fisheries development, cooperatives",
    keywords: ["AGRICULTURE", "LIVESTOCK", "FARM", "IRRIGATION", "FISHERIES"],
    members: []
  },
  "Environment and Natural Resources": {
    description: "Climate change, environment management, forestry, water resource management, wildlife, mining",
    keywords: ["ENVIRONMENT", "CLIMATE", "FOREST", "NATURAL", "RESOURCE", "WILDLIFE"],
    members: []
  },
  "Education and Research": {
    description: "Education, training, research and technological advancement",
    keywords: ["EDUCATION", "RESEARCH", "SCHOOL", "TRAINING", "TECHNOLOGY"],
    members: []
  },
  "Energy": {
    description: "Fossil fuels exploration, energy, communication, broadcasting and ICT development",
    keywords: ["ENERGY", "FUEL", "POWER", "ELECTRICITY", "OIL", "GAS"],
    members: []
  },
  "Health": {
    description: "Matters related to health, medical care and health insurance",
    keywords: ["HEALTH", "MEDICAL", "HOSPITAL", "DOCTOR", "NURSE"],
    members: []
  },
  "Justice and Legal Affairs": {
    description: "Constitutional affairs, administration of law and justice, public prosecutions, elections",
    keywords: ["JUSTICE", "LEGAL", "LAW", "CONSTITUTION", "COURT", "ADVOCATE"],
    members: []
  },
  "Committee on Appointments": {
    description: "Vets nominees for Cabinet Secretary positions and other executive appointments",
    keywords: ["APPOINTMENT", "VETTING", "CABINET", "NOMINATION"],
    members: []
  }
};

// Enhance MP data with leadership positions and committee memberships
function enrichMPData(mps) {
  console.log(`Enhancing data for ${mps.length} MPs...`);
  
  // First pass: Extract information from committees field if it exists
  mps.forEach(mp => {
    // Fix gender classification if unknown
    if (mp.gender === "Unknown" && mp.name) {
      if (mp.name.includes("(MS.)") || mp.name.includes("(MRS.)") || 
          mp.name.includes(" MS ") || mp.name.includes(" MRS ")) {
        mp.gender = "Female";
      } else if (mp.name.includes("(MR.)") || mp.name.includes(" MR ")) {
        mp.gender = "Male";
      } else {
        // Try to guess gender from name if not specified in title
        const maleIndicators = ["JOHN", "DAVID", "PAUL", "GEORGE", "MOSES", "JOSEPH", "MICHAEL", "ROBERT", "BENJAMIN"];
        const femaleIndicators = ["MARY", "GLADYS", "JOYCE", "ESTHER", "SARAH", "JANE", "GRACE", "MARGARET", "BEATRICE"];
        
        const nameUpper = mp.name.toUpperCase();
        
        if (maleIndicators.some(indicator => nameUpper.includes(indicator))) {
          mp.gender = "Male";
        } else if (femaleIndicators.some(indicator => nameUpper.includes(indicator))) {
          mp.gender = "Female";
        }
      }
    }
    
    // Extract committee information from existing committees field
    if (mp.committees && Array.isArray(mp.committees) && mp.committees.length > 0) {
      // Process existing committee entries
      mp.committeeDetails = mp.committees.map(committeeName => {
        // Try to match to known committees
        let matchedCommittee = null;
        for (const [name, details] of Object.entries(parliamentaryCommittees)) {
          if (committeeName.toUpperCase().includes(name.toUpperCase())) {
            matchedCommittee = {
              name: name,
              description: details.description
            };
            // Add MP to this committee's member list if not already added
            if (!details.members.includes(mp.name)) {
              details.members.push(mp.name);
            }
            break;
          }
        }
        
        // If no match, return the original committee name
        return matchedCommittee || { 
          name: committeeName,
          description: "Committee information not available" 
        };
      });
    } else {
      mp.committees = [];
      mp.committeeDetails = [];
    }
  });
  
  // Second pass: Assign leadership positions and infer committees from experience
  mps.forEach(mp => {
    const nameUpper = mp.name.toUpperCase();
    
    // Check if MP has a leadership position
    for (const leader of leadershipPositions) {
      const matchCount = leader.keywords.filter(keyword => 
        nameUpper.includes(keyword.toUpperCase())
      ).length;
      
      if (matchCount >= leader.minMatches) {
        mp.leadershipPosition = leader.position;
        console.log(`Assigned leadership position to ${mp.name}: ${leader.position}`);
        break;
      }
    }
    
    // Infer committee memberships from employment history or name
    if (mp.employmentHistory && Array.isArray(mp.employmentHistory)) {
      // Check employment history for keywords indicating committee interests
      const history = mp.employmentHistory.join(' ').toUpperCase();
      
      for (const [committeeName, details] of Object.entries(parliamentaryCommittees)) {
        // Look for keyword matches in employment history
        const keywordMatches = details.keywords.filter(keyword => 
          history.includes(keyword.toUpperCase())
        ).length;
        
        // If we have good matches and MP is not already in this committee
        if (keywordMatches >= 2 && !mp.committees.includes(committeeName)) {
          mp.committees.push(committeeName);
          mp.committeeDetails.push({
            name: committeeName,
            description: details.description
          });
          details.members.push(mp.name);
          console.log(`Inferred committee membership for ${mp.name}: ${committeeName}`);
        }
      }
    }
    
    // Additional checks for Committee on Appointments members
    // These are typically senior MPs or those with leadership roles
    if (mp.leadershipPosition && !mp.committees.includes("Committee on Appointments")) {
      mp.committees.push("Committee on Appointments");
      mp.committeeDetails.push({
        name: "Committee on Appointments",
        description: parliamentaryCommittees["Committee on Appointments"].description
      });
      parliamentaryCommittees["Committee on Appointments"].members.push(mp.name);
    }
  });
  
  return mps;
}

// Generate a summary report of the enhanced data
function generateSummaryReport(mps) {
  const report = {
    totalMPs: mps.length,
    leadership: leadershipPositions.map(leader => ({
      position: leader.position,
      mp: mps.find(mp => mp.leadershipPosition === leader.position)?.name || "Not matched"
    })),
    committees: Object.entries(parliamentaryCommittees).map(([name, details]) => ({
      name: name,
      description: details.description,
      memberCount: details.members.length,
      members: details.members.slice(0, 5) // Just show first 5 for brevity
    })),
    partyDistribution: {},
    genderDistribution: {
      Male: 0,
      Female: 0,
      Unknown: 0
    },
    countyDistribution: {},
    electionStatus: {
      Elected: 0,
      Nominated: 0,
      Other: 0
    }
  };
  
  // Calculate distributions
  mps.forEach(mp => {
    // Party distribution
    report.partyDistribution[mp.party] = (report.partyDistribution[mp.party] || 0) + 1;
    
    // Gender distribution
    report.genderDistribution[mp.gender || "Unknown"] = (report.genderDistribution[mp.gender || "Unknown"] || 0) + 1;
    
    // County distribution
    if (mp.county && mp.county.trim()) {
      report.countyDistribution[mp.county] = (report.countyDistribution[mp.county] || 0) + 1;
    }
    
    // Election status
    if (mp.status) {
      if (mp.status.includes("Elected")) {
        report.electionStatus.Elected++;
      } else if (mp.status.includes("Nominated")) {
        report.electionStatus.Nominated++;
      } else {
        report.electionStatus.Other++;
      }
    } else {
      report.electionStatus.Other++;
    }
  });
  
  // Sort party distribution by count
  const sortedParties = Object.entries(report.partyDistribution)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});
  
  report.partyDistribution = sortedParties;
  
  // Save the report
  fs.writeFileSync('kenyan_mps_report.json', JSON.stringify(report, null, 2));
  console.log(`Summary report saved to kenyan_mps_report.json`);
  
  // Display some key stats
  console.log(`\n--- Kenya MPs Summary ---`);
  console.log(`Total MPs: ${report.totalMPs}`);
  console.log(`Gender distribution: ${JSON.stringify(report.genderDistribution)}`);
  console.log(`Election status: ${JSON.stringify(report.electionStatus)}`);
  console.log(`Number of parties: ${Object.keys(report.partyDistribution).length}`);
  console.log(`Top 3 parties: ${Object.keys(report.partyDistribution).slice(0, 3).join(', ')}`);
  console.log(`Leadership positions filled: ${report.leadership.filter(l => l.mp !== "Not matched").length}`);
  
  const totalCommitteeMembers = Object.values(parliamentaryCommittees)
    .reduce((sum, committee) => sum + committee.members.length, 0);
  console.log(`Committee memberships assigned: ${totalCommitteeMembers}`);
  
  // Calculate MPs with missing information
  const missingGender = mps.filter(mp => !mp.gender || mp.gender === "Unknown").length;
  const missingParty = mps.filter(mp => !mp.party || mp.party.trim() === "").length;
  const missingCounty = mps.filter(mp => !mp.county || mp.county.trim() === "").length;
  const missingCommittees = mps.filter(mp => !mp.committees || mp.committees.length === 0).length;
  
  console.log(`\n--- Missing Information ---`);
  console.log(`MPs with unknown gender: ${missingGender} (${Math.round(missingGender/mps.length*100)}%)`);
  console.log(`MPs with missing party: ${missingParty} (${Math.round(missingParty/mps.length*100)}%)`);
  console.log(`MPs with missing county: ${missingCounty} (${Math.round(missingCounty/mps.length*100)}%)`);
  console.log(`MPs with no committee assignments: ${missingCommittees} (${Math.round(missingCommittees/mps.length*100)}%)`);
}

// Main function to process and enrich the data
function main() {
  // Load the MP data
  const mps = loadMPData('kenyan_mps_data.json');
  
  if (mps.length === 0) {
    console.error('No MP data found. Please run the scraper first.');
    return;
  }
  
  // Enhance the MP data
  const enhancedMPs = enrichMPData(mps);
  
  // Save the enhanced data
  fs.writeFileSync('kenyan_mps_enhanced.json', JSON.stringify(enhancedMPs, null, 2));
  console.log(`Enhanced data saved to kenyan_mps_enhanced.json`);
  
  // Generate a summary report
  generateSummaryReport(enhancedMPs);
}

// Run the main function
main();
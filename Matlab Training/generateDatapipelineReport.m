function generateDatapipelineReport(T_before,T_after,statsTable)
% ======================================================
% CKD AUTO REPORT GENERATOR
% Saves plots + stats table automatically
% ======================================================

%% ---------- Create results folder ----------
timestamp = datestr(now,'yyyy_mm_dd_HHMMSS');
folderName = "CKD_Report_" + timestamp;

if ~exist(folderName,'dir')
    mkdir(folderName)
end

fprintf("Saving results to: %s\n",folderName)

%% ---------- Save stats table ----------
writetable(statsTable, fullfile(folderName,"StatisticalSummary.xlsx"))

%% ---------- 1. Boxplot BEFORE ----------
fig1 = figure;
boxplot(T_before{:,statsTable.Variable})
title("Before Outlier Processing")
xtickangle(45)
saveas(fig1, fullfile(folderName,"Boxplot_Before.png"))

%% ---------- 2. Boxplot AFTER ----------
fig2 = figure;
boxplot(T_after{:,statsTable.Variable})
title("After Outlier Processing")
xtickangle(45)
saveas(fig2, fullfile(folderName,"Boxplot_After.png"))

%% ---------- 3. Outlier % bar ----------
fig3 = figure;
vars = statsTable.Variable;
outPercent = zeros(length(vars),1);

for i=1:length(vars)
    out = detectOutliers(T_before.(vars{i}),statsTable.RecommendedMethod{i});
    outPercent(i)=sum(out)/length(out)*100;
end

bar(categorical(vars),outPercent)
ylabel("% Outliers")
title("Outlier Percentage")
xtickangle(45)
saveas(fig3, fullfile(folderName,"OutlierPercentage.png"))

%% ---------- 4. Pie BEFORE vs AFTER ----------
fig4 = figure;

for i=1:length(vars)

    v = vars{i};

    out_before = detectOutliers(T_before.(v),statsTable.RecommendedMethod{i});
    out_after  = detectOutliers(T_after.(v),statsTable.RecommendedMethod{i});

    subplot(2,length(vars),i)
    pie([sum(~out_before) sum(out_before)],["Normal","Outliers"])
    title(v+" Before")

    subplot(2,length(vars),i+length(vars))
    pie([sum(~out_after) sum(out_after)],["Normal","Outliers"])
    title(v+" After")

end

sgtitle("Outlier Reduction Comparison")
saveas(fig4, fullfile(folderName,"Pie_BeforeAfter.png"))

%% ---------- 5. Distribution bins ----------
fig5 = figure;

for i=1:length(vars)
    x = T_before.(vars{i});
    Q1 = quantile(x,0.25);
    Q3 = quantile(x,0.75);

    low = sum(x<Q1);
    normal = sum(x>=Q1 & x<=Q3);
    high = sum(x>Q3);

    subplot(2,3,i)
    pie([low normal high],["Low","Normal","High"])
    title(vars{i})
end

sgtitle("Value Distribution")
saveas(fig5, fullfile(folderName,"DistributionBins.png"))

%% ---------- Export all figures to PDF ----------
pdfFile = fullfile(folderName,"CKD_Report.pdf");

exportgraphics(fig1,pdfFile)
exportgraphics(fig2,pdfFile,'Append',true)
exportgraphics(fig3,pdfFile,'Append',true)
exportgraphics(fig4,pdfFile,'Append',true)
exportgraphics(fig5,pdfFile,'Append',true)

fprintf("✓ Report saved successfully\n")
end
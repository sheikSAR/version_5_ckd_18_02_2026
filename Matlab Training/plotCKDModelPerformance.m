function plotCKDModelPerformance(metrics)
% PLOTCKDMODELPERFORMANCE - Visualize RMSE and R² for all models
%
% INPUT:
%   metrics → table with columns: Model, RMSE, R2

models = metrics.Model;
rmse = metrics.RMSE;
R2   = metrics.R2;

figure('Color','w','Position',[100 100 900 450]);

yyaxis left
bar(categorical(models), rmse, 'FaceColor',[0.2 0.6 0.8]);
ylabel('RMSE');
ylim([0 max(rmse)*1.2]);

yyaxis right
plot(categorical(models), R2, '-o','LineWidth',2,'Color',[0.85 0.3 0.2]);
ylabel('R^2');
ylim([0 1.05]);

title('CKD Model Performance');
grid on;
legend('RMSE','R^2','Location','best');
xtickangle(45)
end